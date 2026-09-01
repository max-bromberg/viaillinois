import { parseCalendar } from '../lib/ics.js';
import { resolveRoom } from '../lib/locationSearch.js';
import { allLocations } from '../db/queries/locations.js';
import { findEventsByUid, createEvent, updateEvent } from '../db/queries/events.js';
import { findMidtermsByUid, createMidterm, updateMidterm } from '../db/queries/midterms.js';
import { getCourseCodes } from '../db/queries/courses.js';

/**
 * Import events from an iCalendar file.
 *
 * Two steps on purpose. planEventImport reads the file and says what it would
 * do; applyEventImport does it. An admin importing a semester of events should
 * see the list before it lands, and the plan is also what makes the feature
 * testable without a database.
 *
 * Re-importing the same file updates what the previous import created, matched
 * on the identifier the calendar gave each entry. Anything entered by hand has
 * no such identifier and is never touched, so an import cannot quietly
 * overwrite someone's work.
 */

/**
 * One request should not be able to ask for unbounded work. A calendar with
 * tens of thousands of entries is a mistake or an attack rather than a
 * semester of events, and a thousand is already far more than any RSO
 * publishes in a year.
 */
const MAX_ENTRIES = 1000;

/**
 * Keep the first entry for each identifier.
 *
 * A file can name the same entry twice. A recurring event with an override
 * carries the parent's identifier alongside a RECURRENCE-ID, and calendar
 * programs export that routinely. Both would be planned as creates and the
 * second insert would violate the unique key partway through a loop that has
 * already written the earlier rows.
 */
function dropDuplicateUids(entries) {
  const seen = new Set();
  const unique = [];
  for (const entry of entries) {
    if (seen.has(entry.uid)) continue;
    seen.add(entry.uid);
    unique.push(entry);
  }
  return { unique, duplicates: entries.length - unique.length };
}

function refuseIfOversized(count) {
  if (count > MAX_ENTRIES) {
    throw new Error(
      `That calendar has ${count} entries, and at most ${MAX_ENTRIES} can be imported at once. ` +
      'Export a narrower date range and import it in parts.'
    );
  }
}

/**
 * Work out what a calendar file would do to an RSO's events.
 *
 * @param {{ics: string, rsoId: number}} params
 * @returns {Promise<{entries: Array<object>, skipped: number}>}
 */
export async function planEventImport({ ics, rsoId }) {
  // A file with entries none of which can be scheduled is a different problem
  // from a file that is not a calendar, and only the second is an error. The
  // first is reported as skipped so the admin can see what was not understood.
  if (!String(ics ?? '').includes('BEGIN:VEVENT')) {
    throw new Error('That file has no calendar entries in it. Expected an .ics calendar file.');
  }
  const all = parseCalendar(ics);
  refuseIfOversized(all.length);
  const { unique: parsed, duplicates } = dropDuplicateUids(all);

  const [rooms, existing] = await Promise.all([
    allLocations(),
    findEventsByUid(rsoId, parsed.map(entry => entry.uid)),
  ]);
  const byUid = new Map(existing.map(row => [row.external_uid, row]));

  const entries = parsed.map(entry => {
    const room = entry.location ? resolveRoom(entry.location, rooms) : null;
    const already = byUid.get(entry.uid);
    return {
      action: already ? 'update' : 'create',
      event_id: already?.event_id ?? null,
      external_uid: entry.uid,
      title: entry.title,
      description: entry.description,
      start: entry.start,
      end: entry.end,
      location_id: room?.location_id ?? null,
      // The original text is kept even when a room was matched, so that a bad
      // match can be seen and corrected rather than having to be guessed at.
      location_text: entry.location,
      location_match: room ? `${room.building} ${room.room_number}` : null,
    };
  });

  return { entries, skipped: countSkipped(ics, all.length), duplicates };
}

/**
 * Entries the parser refused, meaning those with no start time or no title.
 * Reported rather than dropped quietly, so an admin can see that a file was
 * not fully understood.
 */
function countSkipped(ics, imported) {
  const total = (ics.match(/BEGIN:VEVENT/g) || []).length;
  return Math.max(0, total - imported);
}

/**
 * Apply what planEventImport described.
 *
 * @param {{ics: string, rsoId: number, createdBy: string}} params
 * @returns {Promise<{created: number, updated: number, skipped: number}>}
 */
export async function applyEventImport({ ics, rsoId, createdBy }) {
  const plan = await planEventImport({ ics, rsoId });
  let created = 0;
  let updated = 0;

  for (const entry of plan.entries) {
    const row = {
      title: entry.title,
      description: entry.description,
      start_time: entry.start,
      end_time: entry.end,
      location_id: entry.location_id,
      location_text: entry.location_text,
    };

    if (entry.action === 'update') {
      await updateEvent(entry.event_id, row);
      updated += 1;
    } else {
      await createEvent({
        ...row,
        rso_id: rsoId,
        created_by: createdBy,
        external_uid: entry.external_uid,
        is_private: false,
      });
      created += 1;
    }
  }

  return { created, updated, skipped: plan.skipped, duplicates: plan.duplicates };
}

// ── Midterms ────────────────────────────────────────────────────────────────

/**
 * HKN publishes one calendar covering every course, so which course a midterm
 * belongs to has to be read out of the entry's title. Titles in the wild look
 * like "ECE 210 Midterm 1", "ECE220 Exam 2" and "Midterm 1 for CS 225", so the
 * code is looked for anywhere in the title, with or without the space.
 *
 * Only codes VIA already has a course row for are accepted. Inventing courses
 * from a title would fill the course list with typos.
 */
export function findCourseCode(title, knownCodes) {
  const compact = new Map(knownCodes.map(code => [code.replace(/\s+/g, '').toUpperCase(), code]));
  for (const match of String(title ?? '').toUpperCase().matchAll(/\b([A-Z]{2,4})\s?(\d{3})\b/g)) {
    const found = compact.get(`${match[1]}${match[2]}`);
    if (found) return found;
  }
  return null;
}

/**
 * Work out what a calendar file would do to the midterm listing.
 *
 * @param {{ics: string}} params
 * @returns {Promise<{entries: Array<object>, skipped: number, unmatched: string[]}>}
 */
export async function planMidtermImport({ ics }) {
  if (!String(ics ?? '').includes('BEGIN:VEVENT')) {
    throw new Error('That file has no calendar entries in it. Expected an .ics calendar file.');
  }
  const all = parseCalendar(ics);
  refuseIfOversized(all.length);
  const { unique: parsed, duplicates } = dropDuplicateUids(all);

  const [rooms, codes] = await Promise.all([allLocations(), getCourseCodes()]);
  const existing = await findMidtermsByUid(parsed.map(entry => entry.uid));
  const byUid = new Map(existing.map(row => [row.external_uid, row]));

  const entries = [];
  const unmatched = [];

  for (const entry of parsed) {
    const courseCode = findCourseCode(entry.title, codes);
    if (!courseCode) {
      unmatched.push(entry.title);
      continue;
    }
    const room = entry.location ? resolveRoom(entry.location, rooms) : null;
    const already = byUid.get(entry.uid);
    entries.push({
      action: already ? 'update' : 'create',
      midterm_id: already?.midterm_id ?? null,
      external_uid: entry.uid,
      course_code: courseCode,
      title: entry.title,
      start: entry.start,
      end: entry.end,
      location_id: room?.location_id ?? null,
      location_text: entry.location,
      location_match: room ? `${room.building} ${room.room_number}` : null,
    });
  }

  return { entries, skipped: countSkipped(ics, all.length), duplicates, unmatched };
}

/**
 * Apply what planMidtermImport described.
 *
 * What HKN publishes is taken as settled, so imported midterms are Confirmed
 * rather than Pending. Pending exists for the ones a student typed in, which
 * an admin still reviews.
 *
 * @param {{ics: string}} params
 * @returns {Promise<{created: number, updated: number, skipped: number, unmatched: string[]}>}
 */
export async function applyMidtermImport({ ics }) {
  const plan = await planMidtermImport({ ics });
  let created = 0;
  let updated = 0;

  for (const entry of plan.entries) {
    const row = {
      course_code: entry.course_code,
      title: entry.title,
      start_time: entry.start,
      end_time: entry.end,
      location_id: entry.location_id,
      location_text: entry.location_text,
    };

    if (entry.action === 'update') {
      // Status is deliberately absent. An admin may have cancelled this
      // midterm, and re-importing the same file should not quietly undo that.
      await updateMidterm(entry.midterm_id, row);
      updated += 1;
    } else {
      await createMidterm({
        ...row, status: 'Confirmed', submitted_by: null, external_uid: entry.external_uid,
      });
      created += 1;
    }
  }

  return { created, updated, skipped: plan.skipped, duplicates: plan.duplicates, unmatched: plan.unmatched };
}
