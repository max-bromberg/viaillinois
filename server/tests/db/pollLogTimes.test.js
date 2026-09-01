import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn().mockResolvedValue({ insertId: 1 }));
vi.mock('../../db/pool.js', () => ({ query: queryMock, default: {} }));

const { insertPollLog, finalizePollLog } = await import('../../db/queries/pollLog.js');

beforeEach(() => queryMock.mockClear());

/**
 * A poller run is stamped by this process, and every other time in the database
 * is campus wall clock. Handing the driver a Date makes the stamp depend on the
 * zone the container started in, so the admin page showed the last run at an
 * hour that matched nothing else on the site.
 */
describe('poll log timestamps', () => {
  it('records the start of a run as campus wall clock', async () => {
    await insertPollLog('courses', new Date(Date.UTC(2026, 6, 15, 23, 0, 0)));
    expect(queryMock.mock.calls[0][1]).toEqual(['courses', '2026-07-15 18:00:00']);
  });

  it('records the end of a run as campus wall clock', async () => {
    await finalizePollLog(7, {
      finishedAt: new Date(Date.UTC(2026, 0, 16, 0, 0, 0)),
      rowsProcessed: 1, rowsSkipped: 0, errorCount: 0,
    });
    expect(queryMock.mock.calls[0][1][0]).toBe('2026-01-15 18:00:00');
  });

  it('leaves a wall clock string that is already campus time alone', async () => {
    await insertPollLog('astra', '2026-07-15 18:00:00');
    expect(queryMock.mock.calls[0][1][1]).toBe('2026-07-15 18:00:00');
  });
});
