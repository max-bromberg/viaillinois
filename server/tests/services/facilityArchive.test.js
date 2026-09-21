import { describe, it, expect, vi, beforeEach } from 'vitest';
import { campusStartOfToday, campusNow } from '../../lib/timezone.js';

/**
 * Moving a booking that has happened out of the working set and into history.
 *
 * The two things this has to get right are both about not corrupting the
 * history it exists to build. A booking may only be archived once the sources
 * have stopped reporting it, because Ad Astra's window opens at midnight of the
 * current campus day and a booking archived at noon comes straight back on the
 * next poll, to be archived again. A booking may also only be archived by one
 * archive run at a time, because both pollers call this and they start
 * together, and two runs over the same rows write every one of them twice.
 */

const state = {
  queries: [],
  lock: 1,
  ceiling: 40,
  committed: false,
  rolledBack: false,
  released: false,
};

const connection = {
  async query(sql, params) {
    state.queries.push({ sql, params });
    if (sql.includes('GET_LOCK')) return [[{ got: state.lock }]];
    if (sql.includes('MAX(reservation_id)')) return [[{ ceiling: state.ceiling }]];
    if (sql.startsWith('INSERT INTO Facility_Reservation_History')) return [{ affectedRows: 3 }];
    return [{ affectedRows: 0 }];
  },
  async beginTransaction() {},
  async commit() { state.committed = true; },
  async rollback() { state.rolledBack = true; },
  release() { state.released = true; },
};

vi.mock('../../db/pool.js', () => ({
  default: { getConnection: async () => connection },
  query: vi.fn(),
}));

const { archiveExpiredReservations } = await import('../../db/queries/facilityReservations.js');

const sqlMatching = pattern => state.queries.filter(entry => pattern.test(entry.sql));

beforeEach(() => {
  state.queries = [];
  state.lock = 1;
  state.ceiling = 40;
  state.committed = false;
  state.rolledBack = false;
  state.released = false;
});

describe('when a booking becomes old enough to archive', () => {
  /**
   * The bug this prevents. Ad Astra is asked for everything from midnight of
   * the current day onwards, so a booking that finished at ten in the morning
   * is still in every poll for the rest of that day. Archiving at the present
   * moment moved it to history at noon, the next poll put it back in the
   * working set, and the poll after that wrote it to history a second time. A
   * booking finishing today would have reached history several times over, and
   * its first seen timestamps would have been reset each time it came back.
   */
  it('waits until the campus day it happened on is over', async () => {
    await archiveExpiredReservations();

    const cutoffs = state.queries
      .filter(entry => Array.isArray(entry.params) && entry.params.includes(campusStartOfToday()))
      .length;
    expect(cutoffs).toBeGreaterThan(0);

    const usesNow = state.queries.some(entry =>
      Array.isArray(entry.params) && entry.params.some(param =>
        typeof param === 'string' && param.startsWith(campusNow().slice(0, 13)) && !param.endsWith('00:00:00')));
    expect(usesNow).toBe(false);
  });
});

describe('when the other poller is already archiving', () => {
  /**
   * Both pollers call this and both run a cycle the moment the server starts,
   * so two archive runs over the same rows is an ordinary Tuesday rather than a
   * rare race. Two runs that each read the same expired rows write each of them
   * to history twice, and nothing in the table would show which copy was real.
   */
  it('leaves the rows to the run that got there first', async () => {
    state.lock = 0;
    const result = await archiveExpiredReservations();

    expect(result).toEqual({ archived: 0, skipped: true });
    expect(sqlMatching(/INSERT INTO Facility_Reservation_History/)).toHaveLength(0);
    expect(sqlMatching(/^DELETE FROM Facility_Reservations/)).toHaveLength(0);
  });

  it('gives the lock back, so the next run is not locked out for ever', async () => {
    await archiveExpiredReservations();
    expect(sqlMatching(/RELEASE_LOCK/)).toHaveLength(1);
    expect(state.released).toBe(true);
  });
});

describe('when a poll writes while the archive is running', () => {
  /**
   * The archive copies rows into history and then deletes them. A booking
   * inserted between those two statements would be deleted without ever having
   * been copied, which is the one loss this whole piece of work exists to
   * prevent. Both statements are held to the rows that existed when the run
   * began, so anything newer waits for the next run.
   */
  it('archives and deletes the same set of rows, and nothing newer', async () => {
    await archiveExpiredReservations();

    const moved = sqlMatching(/INSERT INTO Facility_Reservation_History/)[0];
    const deleted = sqlMatching(/^DELETE FROM Facility_Reservations/)[0];
    expect(moved.sql).toMatch(/reservation_id <= \?/);
    expect(deleted.sql).toMatch(/reservation_id <= \?/);
    expect(moved.params).toContain(40);
    expect(deleted.params).toContain(40);
  });

  it('writes nothing at all when there is nothing old enough yet', async () => {
    state.ceiling = null;
    const result = await archiveExpiredReservations();

    expect(result).toEqual({ archived: 0 });
    expect(sqlMatching(/INSERT INTO Facility_Reservation_History/)).toHaveLength(0);
    expect(sqlMatching(/^DELETE FROM Facility_Reservations/)).toHaveLength(0);
  });
});
