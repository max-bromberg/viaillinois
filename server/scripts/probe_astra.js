/**
 * Probe: follow the full redirect chain from the Ad Astra session URL,
 * collecting cookies at every hop, then hit the data API with all accumulated cookies.
 * Run: node server/scripts/probe_astra.js
 */
import https from 'https';

const SESSION_URL    = 'https://uil.aaiscloud.com/UIUC/default.aspx?home';
const CAMPUS_ID      = '4462ab5a-7ee4-4d62-b2aa-27f0aa0812f5';
const EVENT_TYPE_IDS = [
  '8cce5702-a377-46d3-ba14-69a3efbb0898',
  '1ee7fca9-3eaf-455d-a7d9-db4899c48864',
  '241e080b-e6e0-4751-823c-c43dd9af3397',
  '5558b7a9-3987-45ad-9e3d-8581210e6e6a',
].map(id => `"${id}"`).join(',');

function httpGet(url, cookieJar = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const cookieHeader = Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
    const req = https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    }, res => {
      // Accumulate new cookies from Set-Cookie headers
      const newCookies = {};
      [].concat(res.headers['set-cookie'] ?? []).forEach(raw => {
        const [pair] = raw.split(';');
        const eq = pair.indexOf('=');
        if (eq > 0) newCookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      });
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        newCookies,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

async function followRedirects(startUrl, maxHops = 10) {
  let url = startUrl;
  const jar = {};
  for (let hop = 0; hop < maxHops; hop++) {
    console.log(`  hop ${hop + 1}: GET ${url}`);
    const res = await httpGet(url, jar);
    Object.assign(jar, res.newCookies);
    if (Object.keys(res.newCookies).length) {
      console.log(`    +cookies: ${JSON.stringify(res.newCookies)}`);
    }
    console.log(`    status: ${res.status}`);
    if (res.status >= 300 && res.status < 400 && res.headers['location']) {
      const loc = res.headers['location'];
      url = loc.startsWith('http') ? loc : new URL(loc, url).href;
      console.log(`    → ${url}`);
    } else {
      console.log(`    (no further redirect)`);
      console.log(`    content-type: ${res.headers['content-type'] ?? '(none)'}`);
      console.log(`    body preview: ${res.body.slice(0, 200)}`);
      return { jar, finalUrl: url, finalStatus: res.status, body: res.body };
    }
  }
  throw new Error(`Too many redirects (>${maxHops})`);
}

async function main() {
  console.log('=== Phase 1: Follow full redirect chain from session URL ===');
  let session;
  try {
    session = await followRedirects(SESSION_URL);
  } catch (e) {
    console.error('Redirect chain failed:', e.message);
    process.exit(1);
  }

  console.log(`\nFinal URL: ${session.finalUrl}`);
  console.log(`Cookie jar: ${JSON.stringify(session.jar)}`);

  console.log('\n=== Phase 2: Hit data API with accumulated cookies ===');
  const today = new Date().toISOString().slice(0, 10);
  const end = (() => { const d = new Date(); d.setDate(d.getDate() + 13); return d.toISOString().slice(0, 10); })();

  const filter =
    `((((Location.Room.Building.CampusId in ("${CAMPUS_ID}"))` +
    `&&(EventMeetingByActivityId.Event.EventTypeId in (${EVENT_TYPE_IDS})))` +
    `&&(CurrentState in ("Scheduled")))` +
    `&&((ActivityTypeCode==2)&&(StartDateTime >= "${today}T00:00:00" && StartDateTime <= "${end}T23:59:59")))`;

  const FIELDS = [
    'ActivityId','ActivityName','StartDate','ActivityTypeCode','CampusName',
    'BuildingCode','RoomNumber','LocationName','StartDateTime','EndDateTime',
    'InstructorName:strjoin2(" "," "," ")','Days:strjoin2(" "," "," ")',
    'CanView:strjoin2(" "," "," ")','SectionId','EventId',
    'EventImage:strjoin2(" "," "," ")','ParentActivityId','ParentActivityName',
  ].join(',');

  const params = new URLSearchParams({
    _dc: Date.now(), allowUnlimitedResults: 'true',
    fields: FIELDS, entityProps: '',
    _s: '1', filter, sortOrder: '+StartDateTime', page: '1', start: '0', limit: '500',
    sort: JSON.stringify([{ property: 'StartDateTime', direction: 'ASC' }]),
  });
  const dataUrl = `https://uil.aaiscloud.com/UIUC/~api/calendar/activityList?${params}`;
  console.log(`GET ${dataUrl.slice(0, 120)}...`);

  let dataRes;
  try {
    dataRes = await httpGet(dataUrl, session.jar);
  } catch (e) {
    console.error('Data fetch threw:', e.message);
    process.exit(1);
  }

  console.log(`Status: ${dataRes.status}`);
  console.log(`Content-Type: ${dataRes.headers['content-type'] ?? '(none)'}`);

  if (dataRes.status === 200) {
    try {
      const parsed = JSON.parse(dataRes.body);
      const rows = parsed.data ?? (Array.isArray(parsed) ? parsed : []);
      console.log(`\n[OK] Parsed JSON: success=${parsed.success}, total=${parsed.total}, data rows=${rows.length}`);
      if (rows.length > 0) console.log('Sample row:', JSON.stringify(rows[0], null, 2));
    } catch {
      console.log('[WARN] Body is not JSON:', dataRes.body.slice(0, 300));
    }
  } else {
    console.log(`\n[FAIL] HTTP ${dataRes.status}`);
    console.log(dataRes.body.slice(0, 300));
  }
}

main().catch(e => { console.error('Unhandled:', e); process.exit(1); });
