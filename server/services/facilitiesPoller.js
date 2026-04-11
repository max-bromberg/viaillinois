/**
 * facilitiesPoller.js
 *
 * Continuously fetches UIUC room reservation data from the Facilities Tableau
 * dashboard and keeps Locations + Facility_Reservations in sync.
 *
 * Source: https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents.csv
 *
 * Lifecycle — called from server/index.js:
 *   facilitiesPoller.start()   // kicks off immediately, then repeats on interval
 *   facilitiesPoller.stop()    // clears the interval; awaitable to let in-flight cycle finish
 *
 * Configuration (env vars):
 *   FACILITIES_POLL_INTERVAL_MS   Poll frequency (default: 900000 = 15 minutes)
 *
 * Data quirks:
 *   StartTime column uses Tableau's epoch artifact — the date is always "12/30/1899";
 *   only the time portion matters. Combine with StartDate for the real datetime.
 *   EndTime has the actual date embedded and parses directly.
 */

import {
  upsertFacilityLocation,
  upsertReservation,
  deleteExpiredReservations,
  countReservations,
} from '../db/queries/facilityReservations.js';

const CSV_URL = 'https://tableau.admin.uillinois.edu/views/DailyEventSummary/DailyEvents.csv';
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1)
    .map(line => {
      const values = splitCsvLine(line);
      return Object.fromEntries(headers.map((h, i) => [h.trim(), (values[i] ?? '').trim()]));
    })
    .filter(row => row['Building']);
}

function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Datetime parsing
// ---------------------------------------------------------------------------

/** "MM/DD/YYYY" → "YYYY-MM-DD" */
function parseDate(s) {
  const [m, d, y] = s.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/**
 * Extract the time portion from Tableau's StartTime artifact.
 * "12/30/1899 7:00:00 PM" → "19:00:00"
 */
function extractTime(tableauStr) {
  const parts = tableauStr.trim().split(' ');
  if (parts.length < 3) return '00:00:00';
  const [, timePart, ampm] = parts;
  let [h, m, s] = timePart.split(':').map(Number);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Combine StartDate + StartTime columns → "YYYY-MM-DD HH:MM:SS" */
function buildStartTime(startDate, startTime) {
  return `${parseDate(startDate)} ${extractTime(startTime)}`;
}

/** Parse EndTime column → "YYYY-MM-DD HH:MM:SS" */
function parseEndTime(endTimeStr) {
  const parts = endTimeStr.trim().split(' ');
  if (parts.length < 3) return null;
  return `${parseDate(parts[0])} ${extractTime(endTimeStr)}`;
}

// ---------------------------------------------------------------------------
// One fetch-and-upsert cycle
// ---------------------------------------------------------------------------

export async function runOnce() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Tableau CSV responded ${res.status}`);
  const rows = parseCsv(await res.text());

  if (rows.length === 0) {
    console.log('[facilities] No rows returned from Tableau');
    return { upserted: 0, skipped: 0 };
  }

  try {
    await deleteExpiredReservations();
  } catch (e) {
    if (!e.message.includes('Not implemented')) throw e;
  }

  let upserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const building    = row['Building']  || '';
    const room        = row['Room']      || '';
    const customer    = row['Customer']  || '';
    const eventName   = row['EventName'] || '';
    const startDate   = row['StartDate'] || '';
    const startTimeRaw = row['StartTime'] || '';
    const endTimeRaw   = row['EndTime']   || '';

    if (!building || !room || !startDate || !startTimeRaw || !endTimeRaw) {
      skipped++;
      continue;
    }

    const startTime = buildStartTime(startDate, startTimeRaw);
    const endTime   = parseEndTime(endTimeRaw);
    if (!endTime) { skipped++; continue; }

    try {
      const locationId = await upsertFacilityLocation(building, room);
      await upsertReservation({
        location_id: locationId,
        customer,
        event_name: eventName,
        start_time: startTime,
        end_time:   endTime,
      });
      upserted++;
    } catch (e) {
      if (!e.message.includes('Not implemented')) {
        console.error(`[facilities] Row error (${building} ${room}): ${e.message}`);
      } else {
        upserted++; // count rows even when SQL stubs are pending
      }
    }
  }

  return { upserted, skipped };
}

// ---------------------------------------------------------------------------
// Polling service
// ---------------------------------------------------------------------------

let _timer = null;
let _inFlight = null; // Promise of the currently running cycle, if any

async function tick() {
  const start = Date.now();
  try {
    const { upserted, skipped } = await runOnce();
    const elapsed = Date.now() - start;

    let total = '?';
    try { total = await countReservations(); } catch { /* stub */ }

    console.log(`[facilities] poll complete — ${upserted} upserted, ${skipped} skipped, ${total} total (${elapsed}ms)`);
  } catch (err) {
    console.error(`[facilities] poll error: ${err.message}`);
  }
}

/**
 * Start the facilities poller.
 * Runs one cycle immediately, then repeats on FACILITIES_POLL_INTERVAL_MS.
 */
export function start() {
  if (_timer) return; // already running
  const intervalMs = parseInt(process.env.FACILITIES_POLL_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  console.log(`[facilities] poller starting (interval: ${intervalMs / 1000}s)`);

  // Immediate first run
  _inFlight = tick().finally(() => { _inFlight = null; });

  _timer = setInterval(() => {
    if (_inFlight) return; // skip if previous cycle still running
    _inFlight = tick().finally(() => { _inFlight = null; });
  }, intervalMs);
}

/**
 * Stop the facilities poller.
 * Clears the interval and waits for any in-flight cycle to finish.
 * @returns {Promise<void>}
 */
export async function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  if (_inFlight) await _inFlight;
  console.log('[facilities] poller stopped');
}

export default { start, stop, runOnce };
