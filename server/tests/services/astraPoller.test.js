import { describe, it, expect, vi, beforeEach } from 'vitest';
import https from 'https';

vi.mock('https', () => ({ default: { get: vi.fn() } }));
global.fetch = vi.fn();

vi.mock('../../db/queries/facilityReservations.js', () => ({
  upsertFacilityLocation:    vi.fn().mockResolvedValue(42),
  upsertReservation:         vi.fn().mockResolvedValue({ affectedRows: 1 }),
  deleteExpiredReservations: vi.fn().mockResolvedValue(undefined),
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
