import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const pruneOutbox = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  pruneOutbox,
}));

const pruneLinkSessions = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock('../../db/queries/discordLinks.ts', () => ({ pruneLinkSessions }));

const {
  startOutboxPruner, stopOutboxPruner, pruneOldEntries, pruneExpiredLinkSessions, pruneOnce,
  RETENTION_DAYS,
} = await import('../../services/outboxPruner.js');

beforeEach(() => {
  pruneOutbox.mockClear();
  pruneLinkSessions.mockClear();
  pruneLinkSessions.mockResolvedValue(0);
  delete process.env.OUTBOX_RETENTION_DAYS;
  delete process.env.OUTBOX_PRUNE_INTERVAL_MS;
  vi.useFakeTimers();
});
afterEach(async () => {
  await stopOutboxPruner();
  vi.useRealTimers();
});

/**
 * The outbox is a log of what changed, and a log nobody prunes is a table that
 * only grows. Thirty days is the window the bot's own reconciliation is built
 * around: a reader further behind than that reads the listing endpoints
 * instead, so nothing here is holding anything anybody can still use.
 */
describe('the outbox pruner', () => {
  it('keeps thirty days of entries by default', async () => {
    await pruneOldEntries();
    expect(pruneOutbox).toHaveBeenCalledWith(30);
    expect(RETENTION_DAYS).toBe(30);
  });

  it('keeps the window the environment names instead', async () => {
    process.env.OUTBOX_RETENTION_DAYS = '7';
    await pruneOldEntries();
    expect(pruneOutbox).toHaveBeenCalledWith(7);
  });

  it('prunes once as soon as it starts, rather than waiting out the first interval', async () => {
    // The interval is an hour by default, and a process that restarts more
    // often than that would never prune at all.
    startOutboxPruner({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(pruneOutbox).toHaveBeenCalledTimes(1);
    expect(pruneLinkSessions).toHaveBeenCalledTimes(1);
  });

  it('prunes on the interval once it has been started', async () => {
    startOutboxPruner({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(pruneOutbox).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(pruneOutbox).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pruneOutbox).toHaveBeenCalledTimes(3);
  });

  it('takes the interval from the environment when it is not given one', async () => {
    process.env.OUTBOX_PRUNE_INTERVAL_MS = '500';
    startOutboxPruner();
    await vi.advanceTimersByTimeAsync(500);
    expect(pruneOutbox).toHaveBeenCalledTimes(2);
  });

  it('stops when it is stopped', async () => {
    startOutboxPruner({ intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);
    pruneOutbox.mockClear();
    await stopOutboxPruner();
    await vi.advanceTimersByTimeAsync(5000);
    expect(pruneOutbox).not.toHaveBeenCalled();
  });

  it('reports a prune that failed and carries on', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    pruneOutbox.mockRejectedValueOnce(new Error('the database is away'));

    await expect(pruneOldEntries()).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalled();
    reported.mockRestore();
  });
});

/**
 * A link session is a ten minute handshake that holds a Discord identifier.
 * Every one of them, used or abandoned, would otherwise sit in the table for
 * ever, which turns the table into a list of who asked to link and when.
 */
describe('pruning the link sessions', () => {
  it('removes the sessions that are past their expiry and its day of grace', async () => {
    pruneLinkSessions.mockResolvedValue(3);
    await pruneExpiredLinkSessions();
    expect(pruneLinkSessions).toHaveBeenCalledTimes(1);
  });

  it('reports a prune that failed and carries on', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    pruneLinkSessions.mockRejectedValueOnce(new Error('the database is away'));
    await expect(pruneExpiredLinkSessions()).resolves.toBeUndefined();
    expect(reported).toHaveBeenCalled();
    reported.mockRestore();
  });

  it('runs beside the outbox prune, so one failure does not stop the other', async () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    pruneOutbox.mockRejectedValueOnce(new Error('the database is away'));
    await pruneOnce();
    expect(pruneLinkSessions).toHaveBeenCalledTimes(1);
    reported.mockRestore();
  });
});
