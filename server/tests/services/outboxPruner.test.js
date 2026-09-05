import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const pruneOutbox = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  pruneOutbox,
}));

const { startOutboxPruner, stopOutboxPruner, pruneOldEntries, RETENTION_DAYS } =
  await import('../../services/outboxPruner.js');

beforeEach(() => {
  pruneOutbox.mockClear();
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

  it('prunes on the interval once it has been started', async () => {
    startOutboxPruner({ intervalMs: 1000 });
    expect(pruneOutbox).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(pruneOutbox).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pruneOutbox).toHaveBeenCalledTimes(2);
  });

  it('takes the interval from the environment when it is not given one', async () => {
    process.env.OUTBOX_PRUNE_INTERVAL_MS = '500';
    startOutboxPruner();
    await vi.advanceTimersByTimeAsync(500);
    expect(pruneOutbox).toHaveBeenCalledTimes(1);
  });

  it('stops when it is stopped', async () => {
    startOutboxPruner({ intervalMs: 1000 });
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
