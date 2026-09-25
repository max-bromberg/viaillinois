import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * When each source last showed a booking.
 *
 * Nothing removes a booking that a source stops reporting. A booking cancelled in
 * Ad Astra, or moved to another room or hour, keeps its row in the working set
 * until its date passes and is then archived exactly like a booking that went
 * ahead. Without a record of when each source last showed it, history cannot tell
 * the two apart, and every phantom archived that way is permanent.
 *
 * The last seen time is what makes the difference recoverable. A booking whose last
 * sighting predates a clean poll that covered its date was not in that poll.
 */

const state = { queries: [], lock: 1, ceiling: 40 };

const connection = {
  async query(sql, params) {
    state.queries.push({ sql, params });
    if (sql.includes('GET_LOCK')) return [[{ got: state.lock }]];
    if (sql.includes('MAX(reservation_id)')) return [[{ ceiling: state.ceiling }]];
    if (sql.startsWith('INSERT INTO Facility_Reservation_History')) return [{ affectedRows: 1 }];
    return [{ affectedRows: 0 }];
  },
  async beginTransaction() {},
  async commit() {},
  async rollback() {},
  release() {},
};

const query = vi.fn(async () => ({ affectedRows: 1 }));

vi.mock('../../db/pool.js', () => ({
  default: { getConnection: async () => connection },
  query: (...args) => query(...args),
}));

vi.mock('../../lib/timezone.js', () => ({
  campusNow: () => '2026-09-25 14:00:00',
  campusStartOfToday: () => '2026-09-25 00:00:00',
}));

const { upsertReservation, archiveExpiredReservations } =
  await import('../../db/queries/facilityReservations.js');

const booking = source => ({
  location_id: 1,
  customer: '',
  event_name: 'Soldering night',
  start_time: '2026-10-01 18:00:00',
  end_time: '2026-10-01 20:00:00',
  source,
});

/** The value bound to one named column of the insert, read from its column list. */
function insertedValue(sql, params, column) {
  const columns = sql.match(/\(([^)]*)\)\s*VALUES/s)[1].split(',').map(name => name.trim());
  return params[columns.indexOf(column)];
}

beforeEach(() => {
  query.mockClear();
  state.queries = [];
});

describe('recording when each source last showed a booking', () => {
  it('stamps the source that reported it with the moment it did', async () => {
    await upsertReservation(booking('astra'));

    const [sql, params] = query.mock.calls[0];
    expect(insertedValue(sql, params, 'astra_last_seen')).toBe('2026-09-25 14:00:00');
    expect(insertedValue(sql, params, 'tableau_last_seen')).toBe(null);
  });

  it('stamps Tableau when Tableau reported it, and leaves Ad Astra alone', async () => {
    await upsertReservation(booking('tableau'));

    const [sql, params] = query.mock.calls[0];
    expect(insertedValue(sql, params, 'tableau_last_seen')).toBe('2026-09-25 14:00:00');
    expect(insertedValue(sql, params, 'astra_last_seen')).toBe(null);
  });

  /**
   * First seen keeps the earliest sighting. Last seen has to do the opposite, taking
   * each new sighting, and a poll from one source must never touch the other source's
   * column, because that would record a sighting that never happened.
   */
  it('moves the reporting source forward on every poll and keeps the other where it was', async () => {
    await upsertReservation(booking('astra'));

    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/astra_last_seen\s*=\s*COALESCE\(VALUES\(astra_last_seen\),\s*astra_last_seen\)/);
    expect(sql).toMatch(/tableau_last_seen\s*=\s*COALESCE\(VALUES\(tableau_last_seen\),\s*tableau_last_seen\)/);
  });
});

describe('carrying the last sighting into history', () => {
  it('copies when each source last showed the booking', async () => {
    await archiveExpiredReservations();

    const { sql } = state.queries.find(entry => entry.sql.startsWith('INSERT INTO Facility_Reservation_History'));
    const [, columns, selected] = sql.match(/History\s*\(([^)]*)\)\s*SELECT(.*?)FROM/s);
    expect(columns).toMatch(/astra_last_seen/);
    expect(columns).toMatch(/tableau_last_seen/);
    expect(selected).toMatch(/r\.astra_last_seen/);
    expect(selected).toMatch(/r\.tableau_last_seen/);
  });
});
