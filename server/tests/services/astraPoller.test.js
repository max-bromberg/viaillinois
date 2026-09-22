import { describe, it, expect, vi, beforeEach } from 'vitest';
import https from 'https';

vi.mock('https', () => ({ default: { get: vi.fn() } }));
global.fetch = vi.fn();

vi.mock('../../db/queries/facilityReservations.js', () => ({
  upsertFacilityLocation:    vi.fn().mockResolvedValue(42),
  upsertReservation:         vi.fn().mockResolvedValue({ affectedRows: 1 }),
  archiveExpiredReservations: vi.fn().mockResolvedValue({ archived: 0 }),
  countReservations:         vi.fn().mockResolvedValue(5),
}));

vi.mock('../../lib/locationNormalizer.js', () => ({
  resolveBuilding: vi.fn(s => s),
  resolveRoom:     vi.fn(s => s?.trim() ?? ''),
}));

import { runOnce } from '../../services/astraPoller.js';
import { upsertFacilityLocation, upsertReservation } from '../../db/queries/facilityReservations.js';

// Each row is an array ordered by the FIELDS constant in astraPoller.js:
// [0]=ActivityId [1]=ActivityName [2]=StartDate [3]=ActivityTypeCode [4]=CampusName
// [5]=BuildingCode [6]=RoomNumber [7]=LocationName [8]=StartDateTime [9]=EndDateTime ...
function makeRow(activityName, buildingCode, roomNumber, startDt, endDt) {
  const r = new Array(18).fill('');
  r[1] = activityName; r[5] = buildingCode; r[6] = roomNumber; r[8] = startDt; r[9] = endDt;
  return r;
}

const SAMPLE_ROWS = [
  makeRow('ECE Board Meeting', '1ECEB', '3002', '2026-04-16T09:00:00', '2026-04-16T10:00:00'),
  makeRow('CS Seminar',        '1CIF',  '1034', '2026-04-16T14:00:00', '2026-04-16T16:00:00'),
];

const REQ_STUB = { setTimeout: vi.fn(), on: vi.fn(), destroy: vi.fn() };

/**
 * Simulate the two-hop session flow:
 *   hop 1 → 302 + ASP.NET_SessionId
 *   hop 2 (Logon.aspx) → 302 + UIUC.ASPXFORMSAUTH
 */
function mockSession() {
  // Hop 1: /default.aspx?home
  https.get.mockImplementationOnce((_opts, cb) => {
    cb({
      statusCode: 302,
      headers: {
        location: '/UIUC/Logon.aspx?ReturnUrl=%2fUIUC%2fdefault.aspx%3fhome',
        'set-cookie': ['ASP.NET_SessionId=abc123; path=/; secure; HttpOnly'],
      },
      resume: vi.fn(),
    });
    return REQ_STUB;
  });
  // Hop 2: /Logon.aspx
  https.get.mockImplementationOnce((_opts, cb) => {
    cb({
      statusCode: 302,
      headers: {
        location: '/UIUC/default.aspx?home',
        'set-cookie': ['UIUC.ASPXFORMSAUTH=guesttoken; path=/; secure; HttpOnly'],
      },
      resume: vi.fn(),
    });
    return REQ_STUB;
  });
}

/** Simulate a normal JSON data API response. Wraps rows in { data: [...] } like the real API. */
function mockDataFetch(rows) {
  global.fetch.mockResolvedValueOnce({
    ok: true, redirected: false,
    url: 'https://uil.aaiscloud.com/UIUC/~api/calendar/activityList',
    headers: { get: h => h === 'content-type' ? 'application/json; charset=utf-8' : null },
    json: async () => ({ data: rows }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe('astraPoller.runOnce()', () => {
  it('upserts each valid row and returns correct counts', async () => {
    mockSession();
    mockDataFetch(SAMPLE_ROWS);

    const result = await runOnce();

    expect(upsertFacilityLocation).toHaveBeenCalledTimes(2);
    expect(upsertReservation).toHaveBeenCalledTimes(2);
    expect(upsertReservation).toHaveBeenCalledWith(expect.objectContaining({ source: 'astra' }));
    expect(result).toEqual({ upserted: 2, skipped: 0 });
  });

  it('passes both session cookies (stripped of attributes) to the data API', async () => {
    mockSession();
    mockDataFetch(SAMPLE_ROWS);

    await runOnce();

    const passedCookie = global.fetch.mock.calls[0][1].headers.Cookie;
    expect(passedCookie).toContain('ASP.NET_SessionId=abc123');
    expect(passedCookie).toContain('UIUC.ASPXFORMSAUTH=guesttoken');
  });

  it('skips rows missing BuildingCode, RoomNumber, or datetimes', async () => {
    mockSession();
    mockDataFetch([
      makeRow('X', '',      '3002', '2026-04-16T09:00:00', '2026-04-16T10:00:00'),
      makeRow('X', '1ECEB', '',     '2026-04-16T09:00:00', '2026-04-16T10:00:00'),
      makeRow('X', '1ECEB', '3002', '',                    '2026-04-16T10:00:00'),
      makeRow('X', '1ECEB', '3002', '2026-04-16T09:00:00', ''),
    ]);

    const result = await runOnce();
    expect(result).toEqual({ upserted: 0, skipped: 4 });
  });

  it('returns { upserted: 0, skipped: 0 } when API returns empty array', async () => {
    mockSession();
    mockDataFetch([]);

    const result = await runOnce();
    expect(result).toEqual({ upserted: 0, skipped: 0 });
  });

  it('throws when neither hop returns cookies', async () => {
    // Hop 1: has location but no cookies
    https.get.mockImplementationOnce((_opts, cb) => {
      cb({ statusCode: 302, headers: { location: '/UIUC/Logon.aspx' }, resume: vi.fn() });
      return REQ_STUB;
    });
    // Hop 2: also no cookies
    https.get.mockImplementationOnce((_opts, cb) => {
      cb({ statusCode: 302, headers: {}, resume: vi.fn() });
      return REQ_STUB;
    });
    await expect(runOnce()).rejects.toThrow('no cookies');
  });

  it('throws when https.get emits an error', async () => {
    const errorCbs = {};
    https.get.mockImplementationOnce(() => ({
      setTimeout: vi.fn(),
      on: vi.fn((event, cb) => { errorCbs[event] = cb; }),
      destroy: vi.fn(),
    }));
    // Trigger the error after on('error', ...) is registered
    setImmediate(() => errorCbs['error']?.(new Error('ECONNREFUSED')));
    await expect(runOnce()).rejects.toThrow('ECONNREFUSED');
  });

  it('throws when data API returns non-OK status', async () => {
    mockSession();
    global.fetch.mockResolvedValueOnce({
      ok: false, status: 500, redirected: false,
      url: 'https://uil.aaiscloud.com/UIUC/api/r25/activities',
      headers: { get: () => null },
    });
    await expect(runOnce()).rejects.toThrow('500');
  });

  it('throws with a clear message when data API redirects to the login page', async () => {
    mockSession();
    global.fetch.mockResolvedValueOnce({
      ok: true, redirected: true,
      url: 'https://uil.aaiscloud.com/UIUC/Logon.aspx?ReturnUrl=%2fUIUC%2f~api',
      headers: { get: () => 'text/html; charset=utf-8' },
    });
    await expect(runOnce()).rejects.toThrow('not authenticated');
  });
});

/**
 * What Ad Astra sends beyond where and when a booking is.
 *
 * The request has always asked for eighteen fields and the poller stored four, so the
 * identity of a booking, its type, its series, its section and its instructor were fetched
 * over the network and then dropped on the floor. None of that can be recovered later,
 * which is why capturing it comes before anything that would use it.
 *
 * Every one of them is optional. Ad Astra sends an empty string for a field that does not
 * apply, and a field it stops sending altogether has to arrive as nothing rather than
 * stopping the poll.
 */
describe('the fields the poller used to throw away', () => {
  /** A row with every field Ad Astra offers filled in, at the indices FIELDS declares. */
  function fullRow() {
    const r = new Array(18).fill('');
    r[0] = 'ACT-1001';          // ActivityId
    r[1] = 'ECE 210 Lecture';   // ActivityName
    r[3] = 'LECT';              // ActivityTypeCode
    r[5] = '1ECEB';
    r[6] = '1002';
    r[8] = '2026-04-16T09:00:00';
    r[9] = '2026-04-16T10:00:00';
    r[10] = 'R Garcia';         // InstructorName
    r[13] = 'SEC-55';           // SectionId
    r[14] = 'EVT-900';          // EventId
    r[16] = 'PAR-77';           // ParentActivityId
    return r;
  }

  it('records everything Ad Astra said about the booking', async () => {
    mockSession();
    mockDataFetch([fullRow()]);

    await runOnce();

    expect(upsertReservation).toHaveBeenCalledWith(expect.objectContaining({
      activity_id: 'ACT-1001',
      activity_type: 'LECT',
      instructor: 'R Garcia',
      section_id: 'SEC-55',
      astra_event_id: 'EVT-900',
      parent_activity_id: 'PAR-77',
    }));
  });

  /**
   * A booking that is an event rather than a class has no section and no instructor, and
   * Ad Astra sends empty strings for both. Nothing known is recorded as nothing rather
   * than as an empty string, so that history does not fill with blank dictionary rows.
   */
  it('records a field Ad Astra did not send as nothing rather than as empty', async () => {
    mockSession();
    mockDataFetch([makeRow('ECE Board Meeting', '1ECEB', '3002', '2026-04-16T09:00:00', '2026-04-16T10:00:00')]);

    await runOnce();

    expect(upsertReservation).toHaveBeenCalledWith(expect.objectContaining({
      activity_id: null,
      activity_type: null,
      instructor: null,
      section_id: null,
      astra_event_id: null,
      parent_activity_id: null,
    }));
  });

  /**
   * The row shape is Ad Astra's, not VIA's, and it has changed before. A row shorter than
   * the poller expects must still produce the booking it does describe.
   */
  it('still records the booking when the row is shorter than the field list', async () => {
    mockSession();
    const short = new Array(10).fill('');
    short[1] = 'Truncated row';
    short[5] = '1ECEB'; short[6] = '1002';
    short[8] = '2026-04-16T09:00:00'; short[9] = '2026-04-16T10:00:00';
    mockDataFetch([short]);

    const result = await runOnce();

    expect(result.upserted).toBe(1);
    expect(upsertReservation).toHaveBeenCalledWith(expect.objectContaining({
      event_name: 'Truncated row', instructor: null, section_id: null,
    }));
  });
});

/**
 * The columns these fields are written into have lengths, and MySQL refuses a value longer
 * than the column rather than trimming it. A refusal inside the row loop is caught and
 * logged, so an unexpectedly long identifier would cost the whole booking rather than just
 * the field. Ad Astra's row shape has changed before, so the cap matches the column.
 */
describe('a field longer than the column that holds it', () => {
  it('is stored cut to the column rather than costing the booking', async () => {
    const row = new Array(18).fill('');
    row[1] = 'ECE 210 Lecture';
    row[5] = '1ECEB';
    row[6] = '1002';
    row[8] = '2026-04-16T09:00:00';
    row[9] = '2026-04-16T10:00:00';
    row[0] = 'A'.repeat(90);   // activity_id, varchar(40)
    row[3] = 'B'.repeat(90);   // activity_type, varchar(32)
    row[10] = 'C'.repeat(300); // instructor, varchar(200)
    row[13] = 'D'.repeat(90);  // section_id, varchar(32)
    row[14] = 'E'.repeat(90);  // astra_event_id, varchar(40)
    row[16] = 'F'.repeat(90);  // parent_activity_id, varchar(40)

    mockSession();
    mockDataFetch([row]);
    await runOnce();

    const written = upsertReservation.mock.calls.at(-1)[0];
    expect(written.activity_id).toHaveLength(40);
    expect(written.astra_event_id).toHaveLength(40);
    expect(written.parent_activity_id).toHaveLength(40);
    expect(written.activity_type).toHaveLength(32);
    expect(written.section_id).toHaveLength(32);
    expect(written.instructor).toHaveLength(200);
  });
});
