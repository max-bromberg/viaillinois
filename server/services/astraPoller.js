/**
 * astraPoller.js
 *
 * Continuously fetches UIUC room reservation data from the Ad Astra
 * scheduling API and upserts into Facility_Reservations, merging with
 * any Tableau-sourced rows for the same room/time via ON DUPLICATE KEY UPDATE.
 *
 * Session: two-hop redirect chain on GET /UIUC/default.aspx?home issues both
 * ASP.NET_SessionId and UIUC.ASPXFORMSAUTH (anonymous guest token). Both cookies
 * are required. No credentials needed. Refreshed each cycle.
 *
 * Lifecycle, called from server/index.js:
 *   astraPoller.start()
 *   astraPoller.stop()
 *
 * Configuration (env vars):
 *   ASTRA_POLL_INTERVAL_MS   Poll frequency (default: 14400000 = 4 hours)
 */

import https from 'https';

import {
  upsertFacilityLocation,
  upsertReservation,
  deleteExpiredReservations,
} from '../db/queries/facilityReservations.js';

import { resolveBuilding, resolveRoom } from '../lib/locationNormalizer.js';
import { runWithLogging } from '../lib/pollerUtils.js';

const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

const SESSION_URL    = 'https://uil.aaiscloud.com/UIUC/default.aspx?home';
const DATA_API_BASE  = 'https://uil.aaiscloud.com/UIUC/~api/calendar/activityList';

// UIUC main campus ID.
// Probe results (2026-04-23): campus+scheduled with 180-day window yields 5,729 rows
// vs 2,397 rows with the original EventTypeId+ActivityTypeCode+14-day restrictions, so 139% more data.
// EventTypeId and ActivityTypeCode filters were redundant (all returned rows had actType==2
// regardless), so they are intentionally omitted here. Returns diminish past 90 days
// (5,161 rows) but anything booked 6 months out is still worth capturing.
const CAMPUS_ID = '4462ab5a-7ee4-4d62-b2aa-27f0aa0812f5';

// Field list sent to the API. The response is an array-of-arrays; these indices are authoritative.
const FIELDS = [
  'ActivityId',                            // 0
  'ActivityName',                          // 1
  'StartDate',                             // 2
  'ActivityTypeCode',                      // 3
  'CampusName',                            // 4
  'BuildingCode',                          // 5
  'RoomNumber',                            // 6
  'LocationName',                          // 7
  'StartDateTime',                         // 8
  'EndDateTime',                           // 9
  'InstructorName:strjoin2(" "," "," ")', // 10
  'Days:strjoin2(" "," "," ")',           // 11
  'CanView:strjoin2(" "," "," ")',        // 12
  'SectionId',                             // 13
  'EventId',                               // 14
  'EventImage:strjoin2(" "," "," ")',     // 15
  'ParentActivityId',                      // 16
  'ParentActivityName',                    // 17
];

const PAGE_SIZE = 500;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * Make one raw HTTPS GET (no redirect following) and return status, location,
 * Set-Cookie values, and a discarded body signal.
 *
 * @param {string} url
 * @param {string} cookieHeader  Optional Cookie request header value
 * @returns {Promise<{status:number, location:string|null, setCookies:string[]}>}
 */
function rawGet(url, cookieHeader = '') {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    }, res => {
      res.resume();
      resolve({
        status: res.statusCode,
        location: res.headers['location'] ?? null,
        setCookies: [].concat(res.headers['set-cookie'] ?? []),
      });
    });
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('Ad Astra session fetch timed out')); });
    req.on('error', err => reject(new Error(`Ad Astra session fetch failed: ${err.message}`)));
  });
}

/** Parse Set-Cookie headers into a name→value map, stripping attributes. */
function parseCookies(setCookies) {
  const jar = {};
  for (const raw of setCookies) {
    const pair = raw.split(';')[0].trim();
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

function jarToHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Establish an authenticated Ad Astra session and return a Cookie header string.
 *
 * The UIUC Ad Astra instance grants anonymous access via a two-hop redirect:
 *   1. GET /UIUC/default.aspx?home  → 302 + ASP.NET_SessionId
 *   2. GET /UIUC/Logon.aspx         → 302 + UIUC.ASPXFORMSAUTH (guest token, no credentials needed)
 *
 * Both cookies are required for the data API to accept the request.
 *
 * @returns {Promise<string>}  e.g. "ASP.NET_SessionId=abc; UIUC.ASPXFORMSAUTH=def"
 */
async function fetchSessionCookie() {
  // Hop 1: initial page → ASP.NET_SessionId
  const hop1 = await rawGet(SESSION_URL);
  const jar = parseCookies(hop1.setCookies);

  if (!hop1.location) {
    // Unexpected: page loaded without redirect, so still return any cookies we got
    const header = jarToHeader(jar);
    if (!header) throw new Error(`Ad Astra session returned no cookies (HTTP ${hop1.status})`);
    return header;
  }

  // Hop 2: follow to Logon.aspx with the session cookie → UIUC.ASPXFORMSAUTH
  const loginUrl = hop1.location.startsWith('http')
    ? hop1.location
    : new URL(hop1.location, SESSION_URL).href;

  const hop2 = await rawGet(loginUrl, jarToHeader(jar));
  Object.assign(jar, parseCookies(hop2.setCookies));

  const header = jarToHeader(jar);
  if (!header) {
    throw new Error(`Ad Astra session returned no cookies after redirect chain (HTTP ${hop2.status})`);
  }
  return header;
}

// ---------------------------------------------------------------------------
// Data fetch
// ---------------------------------------------------------------------------

/**
 * Build a YYYY-MM-DD string offset from today.
 * @param {number} offsetDays
 */
function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch one page of activities from the Ad Astra API.
 * The response rows are arrays ordered by FIELDS, not keyed objects.
 * @returns {Promise<Array[]>}
 */
async function fetchPage(cookie, filter, start) {
  const params = new URLSearchParams({
    _dc:                  Date.now(),
    allowUnlimitedResults: 'true',
    fields:               FIELDS.join(','),
    entityProps:          '',
    _s:                   '1',
    filter,
    sortOrder:            '+StartDateTime',
    page:                 String(Math.floor(start / PAGE_SIZE) + 1),
    start:                String(start),
    limit:                String(PAGE_SIZE),
    sort:                 JSON.stringify([{ property: 'StartDateTime', direction: 'ASC' }]),
  });

  const res = await fetch(`${DATA_API_BASE}?${params}`, { headers: { Cookie: cookie } });

  if (res.redirected && res.url.includes('Logon')) {
    throw new Error(`Ad Astra session not authenticated (redirected to ${res.url})`);
  }
  if (!res.ok) throw new Error(`Ad Astra data fetch failed: HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    throw new Error(`Ad Astra data API returned non-JSON (Content-Type: ${contentType}), the session may be expired`);
  }

  const body = await res.json();
  return body.data ?? (Array.isArray(body) ? body : []);
}

/**
 * Fetch all activities for the rolling 180-day window, paginating in PAGE_SIZE chunks.
 * Filter: UIUC main campus + Scheduled state only.
 * @param {string} cookie  Cookie header value from fetchSessionCookie()
 * @returns {Promise<Array[]>}  All activity rows (each row is an array indexed by FIELDS)
 */
async function fetchActivities(cookie) {
  const startDate = isoDate(0);
  const endDate   = isoDate(179);

  const filter =
    `((Location.Room.Building.CampusId in ("${CAMPUS_ID}"))` +
    `&&(CurrentState in ("Scheduled"))` +
    `&&(StartDateTime >= "${startDate}T00:00:00" && StartDateTime <= "${endDate}T23:59:59"))`;

  const all = [];
  let start = 0;
  while (true) {
    const page = await fetchPage(cookie, filter, start);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
    console.log(`[astra] fetched ${all.length} rows so far, loading next page...`);
  }
  return all;
}

// ---------------------------------------------------------------------------
// One full sync cycle
// ---------------------------------------------------------------------------

export async function runOnce() {
  const cookie = await fetchSessionCookie();
  const rows   = await fetchActivities(cookie);

  // If the API returned nothing, skip pruning, since an empty response may indicate
  // a temporary outage rather than genuinely no events. Preserving stale rows
  // is safer than pruning everything and leaving the DB empty.
  if (rows.length === 0) {
    console.log('[astra] No rows returned from Ad Astra API');
    return { upserted: 0, skipped: 0 };
  }

  try {
    await deleteExpiredReservations();
  } catch (e) {
    if (!e.message.includes('Not implemented')) throw e;
  }

  let upserted = 0;
  let skipped  = 0;

  for (const row of rows) {
    // Rows are arrays indexed by FIELDS (see top of file)
    const eventName   = row[1]  || '';
    const buildingRaw = row[5]  || '';
    const roomRaw     = row[6]  || '';
    const startTime   = row[8]  || '';
    const endTime     = row[9]  || '';

    if (!buildingRaw || !roomRaw || !startTime || !endTime) {
      skipped++;
      continue;
    }

    const building = resolveBuilding(buildingRaw);
    const room     = resolveRoom(roomRaw);

    try {
      const locationId = await upsertFacilityLocation(building, room);
      const result = await upsertReservation({
        location_id: locationId,
        customer:    '',
        event_name:  eventName,
        start_time:  startTime,
        end_time:    endTime,
        source:      'astra',
      });
      if (result?.affectedRows > 0) upserted++;
    } catch (e) {
      if (!e.message.includes('Not implemented')) {
        console.error(`[astra] Row error (${buildingRaw} ${roomRaw}): ${e.message}`);
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

let _timer    = null;
let _inFlight = null;

async function tick() {
  const start = Date.now();
  try {
    const { upserted, skipped } = await runWithLogging('astra', runOnce);
    const elapsed = Date.now() - start;
    console.log(`[astra] poll complete: ${upserted} upserted, ${skipped} skipped (${elapsed}ms)`);
  } catch (err) {
    console.error(`[astra] poll error: ${err.message}`);
  }
}

export function isRunning() {
  return _inFlight !== null;
}

export function start() {
  if (_timer) return;
  const intervalMs = parseInt(process.env.ASTRA_POLL_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
  console.log(`[astra] poller starting (interval: ${intervalMs / 1000}s)`);
  _inFlight = tick().finally(() => { _inFlight = null; });
  _timer = setInterval(() => {
    if (_inFlight) return;
    _inFlight = tick().finally(() => { _inFlight = null; });
  }, intervalMs);
}

export async function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
  if (_inFlight) await _inFlight;
  console.log('[astra] poller stopped');
}

export default { start, stop, runOnce, isRunning };
