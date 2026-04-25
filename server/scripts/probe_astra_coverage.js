/**
 * Coverage probe: test different filter configurations against the live Ad Astra API
 * to find the combination that captures the most room reservation data.
 * Run: node server/scripts/probe_astra_coverage.js
 */
import https from 'https';

const SESSION_URL  = 'https://uil.aaiscloud.com/UIUC/default.aspx?home';
const DATA_API_BASE = 'https://uil.aaiscloud.com/UIUC/~api/calendar/activityList';

const CAMPUS_ID      = '4462ab5a-7ee4-4d62-b2aa-27f0aa0812f5';
const EVENT_TYPE_IDS = [
  '8cce5702-a377-46d3-ba14-69a3efbb0898',
  '1ee7fca9-3eaf-455d-a7d9-db4899c48864',
  '241e080b-e6e0-4751-823c-c43dd9af3397',
  '5558b7a9-3987-45ad-9e3d-8581210e6e6a',
].map(id => `"${id}"`).join(',');

const FIELDS = [
  'ActivityId','ActivityName','StartDate','ActivityTypeCode','CampusName',
  'BuildingCode','RoomNumber','LocationName','StartDateTime','EndDateTime',
  'InstructorName:strjoin2(" "," "," ")','Days:strjoin2(" "," "," ")',
  'CanView:strjoin2(" "," "," ")','SectionId','EventId',
  'EventImage:strjoin2(" "," "," ")','ParentActivityId','ParentActivityName',
].join(',');

function rawGet(url, jar = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const cookieHeader = Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
    const req = https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        setCookies: [].concat(res.headers['set-cookie'] ?? []),
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.setTimeout(20_000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function parseCookies(setCookies) {
  const jar = {};
  for (const raw of setCookies) {
    const pair = raw.split(';')[0].trim();
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return jar;
}

async function getSession() {
  const h1 = await rawGet(SESSION_URL);
  const jar = parseCookies(h1.setCookies);
  const loginUrl = h1.headers['location']?.startsWith('http')
    ? h1.headers['location']
    : new URL(h1.headers['location'], SESSION_URL).href;
  const h2 = await rawGet(loginUrl, jar);
  Object.assign(jar, parseCookies(h2.setCookies));
  return Object.entries(jar).map(([k,v]) => `${k}=${v}`).join('; ');
}

function isoDate(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function fetchAllRows(cookie, filter) {
  const all = [];
  let start = 0;
  while (true) {
    const params = new URLSearchParams({
      _dc: Date.now(), allowUnlimitedResults: 'true',
      fields: FIELDS, entityProps: '', _s: '1', filter,
      sortOrder: '+StartDateTime',
      page: String(Math.floor(start / 500) + 1), start: String(start), limit: '500',
      sort: JSON.stringify([{ property: 'StartDateTime', direction: 'ASC' }]),
    });
    const res = await fetch(`${DATA_API_BASE}?${params}`, { headers: { Cookie: cookie } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const page = body.data ?? (Array.isArray(body) ? body : []);
    all.push(...page);
    if (page.length < 500) break;
    start += 500;
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 300));
  }
  return all;
}

async function countRows(cookie, filter, label) {
  process.stdout.write(`  ${label}: `);
  try {
    const rows = await fetchAllRows(cookie, filter);
    const typeCodes = [...new Set(rows.map(r => r[3]))].sort().join(', ');
    const buildings = [...new Set(rows.map(r => r[5]).filter(Boolean))].sort();
    console.log(`\n    → ${rows.length} total rows`);
    console.log(`    ActivityTypeCodes: ${typeCodes || '(none)'}`);
    console.log(`    Unique buildings:  ${buildings.length} (${buildings.slice(0, 10).join(', ')}${buildings.length > 10 ? '...' : ''})`);
  } catch(e) {
    console.log(`\n    ERROR — ${e.message}`);
  }
}

async function main() {
  console.log('Establishing session...');
  const cookie = await getSession();
  console.log('Session established.\n');

  const today  = isoDate(0);
  const end14  = isoDate(13);
  const end30  = isoDate(29);
  const end60  = isoDate(59);

  const dateRange = (start, end) =>
    `(StartDateTime >= "${start}T00:00:00" && StartDateTime <= "${end}T23:59:59")`;

  // Fully decompose the filter to understand what each piece excludes
  const campus   = `Location.Room.Building.CampusId in ("${CAMPUS_ID}")`;
  const evtTypes = `EventMeetingByActivityId.Event.EventTypeId in (${EVENT_TYPE_IDS})`;
  const scheduled = `CurrentState in ("Scheduled")`;
  const actType2  = `ActivityTypeCode==2`;

  const scenarios = [
    // --- Baseline (current production filter, 14 days) ---
    ['[CURRENT] campus + evtTypes + scheduled + actType==2, 14 days',
      `((((${campus})&&(${evtTypes}))&&(${scheduled}))&&((${actType2})&&${dateRange(today, end14)}))`],

    // --- Remove ActivityTypeCode==2 ---
    ['campus + evtTypes + scheduled, 14 days (no actType filter)',
      `(((${campus})&&(${evtTypes}))&&(${scheduled}&&${dateRange(today, end14)}))`],

    // --- Remove EventTypeId filter ---
    ['campus + scheduled + actType==2, 14 days (no evtType filter)',
      `((${campus})&&(${scheduled}&&(${actType2})&&${dateRange(today, end14)}))`],

    // --- Remove both ActivityTypeCode and EventTypeId ---
    ['campus + scheduled only, 14 days',
      `((${campus})&&(${scheduled}&&${dateRange(today, end14)}))`],

    // --- No filters at all except date range ---
    ['date range only, 14 days',
      `${dateRange(today, end14)}`],

    // --- Campus + scheduled, extended windows ---
    ['campus + scheduled only, 30 days',
      `((${campus})&&(${scheduled}&&${dateRange(today, end30)}))`],

    ['campus + scheduled only, 60 days',
      `((${campus})&&(${scheduled}&&${dateRange(today, end60)}))`],
  ];

  for (const [label, filter] of scenarios) {
    await countRows(cookie, filter, label);
    await new Promise(r => setTimeout(r, 300)); // brief pause between requests
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
