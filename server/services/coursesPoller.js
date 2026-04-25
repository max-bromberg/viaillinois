/**
 * coursesPoller.js
 *
 * Continuously syncs UIUC course and section data from the Course Explorer
 * public XML API into the Courses, Course_Sections, and Locations tables.
 *
 * Source: https://courses.illinois.edu/cisapp/explorer/schedule/{year}/{semester}/{subject}.xml
 *
 * Lifecycle — called from server/index.js:
 *   coursesPoller.start()   // kicks off immediately, then repeats on interval
 *   coursesPoller.stop()    // clears the interval; awaitable to let in-flight cycle finish
 *
 * Configuration (env vars):
 *   COURSES_POLL_INTERVAL_MS   Poll frequency (default: 86400000 = 24 hours)
 *
 * Semester detection:
 *   Derived from the current wall-clock date — no manual configuration needed.
 *   Jan–Apr → spring, May–Jul → summer, Aug–Dec → fall.
 *   INSERT IGNORE semantics make re-runs across overlapping semesters safe.
 */

import { parseStringPromise } from 'xml2js';
import { upsertLocation } from '../db/queries/locations.js';
import { upsertCourse, upsertSection } from '../db/queries/courses.js';
import { resolveBuilding, resolveRoom } from '../lib/locationNormalizer.js';
import { runWithLogging } from '../lib/pollerUtils.js';

const BASE_URL = 'https://courses.illinois.edu/cisapp/explorer/schedule';

// Delay between individual HTTP requests to avoid triggering rate limits.
const REQUEST_DELAY_MS = parseInt(process.env.COURSES_REQUEST_DELAY_MS) || 200;
const MAX_RETRIES      = 2;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry on 429 (rate-limit) and 5xx (transient server errors); throw immediately on other 4xx.
function isRetryable(e) {
  const m = e.message ?? '';
  if (m === 'Poller stopped' || m.startsWith('Timeout')) return false;
  const httpCode = m.match(/HTTP (\d{3})/)?.[1];
  if (!httpCode) return true;           // network-level error → retry
  if (httpCode === '429') return true;
  if (httpCode[0] === '5') return true;
  return false;                         // 4xx (except 429) → fail immediately
}

// Convert "10:00 AM" / "10:50 PM" → "10:00:00" / "22:50:00" for MySQL TIME columns
function toMysqlTime(apiTime) {
  if (!apiTime) return '00:00:00';
  const match = apiTime.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return apiTime; // already HH:MM or HH:MM:SS
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();
  if (period === 'AM' && hours === 12) hours = 0;
  if (period === 'PM' && hours !== 12) hours += 12;
  return `${String(hours).padStart(2, '0')}:${minutes}:00`;
}
const SUBJECTS = ['ECE', 'CS', 'MATH', 'PHYS', 'IE', 'TAM', 'STAT'];
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Safely coerce an xml2js value to a plain string. */
function str(val) {
  if (!val && val !== 0) return '';
  if (typeof val === 'object') return val._ ?? '';
  return String(val);
}

/**
 * Normalize Course Explorer meeting type strings to the canonical set stored in DB.
 * Source values seen in the wild: "Lecture", "Discussion", "Laboratory",
 * "Lecture-Discussion", "Discussion/Recitation", "Online", "Individual Instruction", etc.
 */
function normalizeSectionType(raw) {
  if (!raw) return 'other';
  const s = str(raw).toLowerCase();
  if (s.includes('lecture')) return 'lecture';
  if (s.includes('lab')) return 'lab';
  if (s.includes('discussion') || s.includes('recitation')) return 'discussion';
  if (s.includes('online') || s.includes('web')) return 'online';
  return 'other';
}

// ---------------------------------------------------------------------------
// Semester detection
// ---------------------------------------------------------------------------

/**
 * Derive { year, semester } from today's date.
 * Jan–Apr → spring, May–Jul → summer, Aug–Dec → fall.
 */
export function currentSemester(now = new Date()) {
  const month = now.getUTCMonth() + 1; // 1–12, UTC to avoid DST/timezone edge cases
  const year  = now.getUTCFullYear();
  if (month <= 4) return { year, semester: 'spring' };
  if (month <= 7) return { year, semester: 'summer' };
  return { year, semester: 'fall' };
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 15_000;

async function fetchXmlOnce(url, abortSignal) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onStop     = () => controller.abort();
  abortSignal?.addEventListener('abort', onStop, { once: true });
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return parseStringPromise(await res.text(), { explicitArray: false });
  } catch (e) {
    if (e.name === 'AbortError') {
      if (abortSignal?.aborted) throw new Error('Poller stopped');
      throw new Error(`Timeout fetching ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
    abortSignal?.removeEventListener('abort', onStop);
  }
}

async function fetchXml(url, abortSignal) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (abortSignal?.aborted) throw new Error('Poller stopped');
    if (attempt > 0) await sleep(REQUEST_DELAY_MS * (1 << attempt)); // 400ms, 800ms
    try {
      return await fetchXmlOnce(url, abortSignal);
    } catch (e) {
      if (!isRetryable(e)) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// One full sync cycle
// ---------------------------------------------------------------------------

export async function runOnce(signal) {
  const { year, semester: semType } = currentSemester();
  const semester = `${semType} ${year}`; // e.g. "spring 2026" — year needed to distinguish across academic years
  console.log(`[courses] syncing ${semester} (subjects: ${SUBJECTS.join(', ')})`);

  let totalCourses = 0;
  let totalSections = 0;
  let totalErrors = 0;

  for (const subject of SUBJECTS) {
    if (signal?.aborted) break;
    try {
      console.log(`[courses] fetching subject ${subject}...`);
      const subjectData = await fetchXml(`${BASE_URL}/${year}/${semType}/${subject}.xml`, signal);
      const raw = subjectData?.['ns2:subject']?.courses?.course;
      if (!raw) { console.log(`[courses] ${subject}: no courses found in response`); continue; }

      const courseList = Array.isArray(raw) ? raw : [raw];
      console.log(`[courses] ${subject}: ${courseList.length} courses`);

      for (let ci = 0; ci < courseList.length; ci++) {
        if (signal?.aborted) break;
        const course = courseList[ci];
        const courseCode = `${subject} ${course.$.id}`;
        const title = course._ || course.label || 'Unknown';
        console.log(`[courses] ${courseCode} (${ci + 1}/${courseList.length}): upserting course...`);
        try {
          await upsertCourse(courseCode, title);
          totalCourses++;
        } catch (e) {
          if (!e.message.includes('Not implemented')) {
            console.error(`[courses] ${courseCode}: upsertCourse failed — ${e.message}`);
            totalErrors++; continue;
          }
          totalCourses++; // count even when stub is pending
        }

        // Fetch sections
        console.log(`[courses] ${courseCode}: fetching sections...`);
        try {
          await sleep(REQUEST_DELAY_MS);
          const courseData = await fetchXml(`${BASE_URL}/${year}/${semType}/${subject}/${course.$.id}.xml`, signal);
          const rawSectionRefs = courseData?.['ns2:course']?.sections?.section;
          if (!rawSectionRefs) continue;

          const sectionRefs = Array.isArray(rawSectionRefs) ? rawSectionRefs : [rawSectionRefs];

          for (const sectionRef of sectionRefs) {
            const sectionUrl = sectionRef?.$?.href;
            if (!sectionUrl) continue;
            if (signal?.aborted) break;
            let sectionData;
            try {
              await sleep(REQUEST_DELAY_MS);
              sectionData = await fetchXml(sectionUrl, signal);
            } catch (e) {
              console.warn(`[courses] ${courseCode}: failed to fetch section — ${e.message}`);
              totalErrors++;
              continue;
            }
            const section = sectionData?.['ns2:section'];
            if (!section) continue;

            const rawMeetings = section.meetings?.meeting;
            if (!rawMeetings) continue;
            const meetings = Array.isArray(rawMeetings) ? rawMeetings : [rawMeetings];

            for (const meeting of meetings) {
              const buildingRaw = str(meeting.buildingName);
              const roomRaw     = str(meeting.roomNumber);
              const startRaw    = str(meeting.start);
              const endRaw      = str(meeting.end);

              // Skip ARRANGED or otherwise incomplete meetings — they have no usable location or time
              if (!buildingRaw || !roomRaw || !startRaw || startRaw === 'ARRANGED' || !endRaw) continue;

              const building     = resolveBuilding(buildingRaw);
              const roomNumber   = resolveRoom(roomRaw);
              const startTime    = toMysqlTime(startRaw);
              const endTime      = toMysqlTime(endRaw);
              const daysOfWeek   = str(meeting.daysOfTheWeek) || 'TBA';
              const capacity     = parseInt(str(meeting.roomCapacity) || '30');
              const sectionType  = normalizeSectionType(meeting.type);

              try {
                const locationId = await upsertLocation(building, roomNumber, capacity);
                await upsertSection(courseCode, locationId, daysOfWeek, startTime, endTime, semester, sectionType);
                totalSections++;
              } catch (e) {
                if (!e.message.includes('Not implemented')) {
                  console.error(`[courses] ${courseCode}: upsertLocation/Section failed — ${e.message}`);
                  totalErrors++;
                } else totalSections++; // count when stub is pending
              }
            }
          }
        } catch (e) {
          console.warn(`[courses] ${courseCode}: failed to fetch sections — ${e.message}`);
          totalErrors++;
        }
      }
      console.log(`[courses] ${subject}: done (${totalCourses} courses, ${totalSections} sections so far)`);
    } catch (e) {
      console.error(`[courses] failed to fetch subject ${subject}: ${e.message}`);
      totalErrors++;
    }
  }

  return { year, semester, totalCourses, totalSections, totalErrors };
}

// ---------------------------------------------------------------------------
// Polling service
// ---------------------------------------------------------------------------

let _timer = null;
let _inFlight = null;
let _abortController = null;

async function tick(signal) {
  const start = Date.now();
  try {
    const result = await runWithLogging('courses', () => runOnce(signal));
    if (signal?.aborted) return;
    const elapsed = Date.now() - start;
    const { totalCourses = 0, totalSections = 0, totalErrors = 0 } = result ?? {};
    console.log(
      `[courses] poll complete — ${totalCourses} courses, ${totalSections} sections, ` +
      `${totalErrors} errors (${elapsed}ms)`
    );
  } catch (err) {
    if (!signal?.aborted) console.error(`[courses] poll error: ${err.message}`);
  }
}

export function isRunning() {
  return _inFlight !== null;
}

/**
 * Start the courses poller.
 * Runs one cycle immediately, then repeats on COURSES_POLL_INTERVAL_MS.
 */
export function start() {
  if (_timer) return;
  const intervalMs = parseInt(process.env.COURSES_POLL_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  console.log(`[courses] poller starting (interval: ${intervalMs / 1000}s)`);

  _abortController = new AbortController();

  _inFlight = tick(_abortController.signal).finally(() => { _inFlight = null; });

  _timer = setInterval(() => {
    if (_inFlight) return;
    _inFlight = tick(_abortController.signal).finally(() => { _inFlight = null; });
  }, intervalMs);
}

/**
 * Stop the courses poller.
 * Aborts any in-flight cycle immediately, then clears the interval.
 * @returns {Promise<void>}
 */
export async function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  if (_abortController) { _abortController.abort(); _abortController = null; }
  if (_inFlight) await _inFlight;
  console.log('[courses] poller stopped');
}

export default { start, stop, runOnce, isRunning };
