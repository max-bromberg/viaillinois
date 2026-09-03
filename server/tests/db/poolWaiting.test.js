import { describe, it, expect, vi } from 'vitest';

const poolQuery = vi.hoisted(() => vi.fn());
vi.mock('mysql2/promise', () => ({
  default: { createPool: () => ({ query: poolQuery, end: vi.fn() }) },
}));

const { query, waitingCount } = await import('../../db/pool.js');

/**
 * The pool allows ten connections and used to let callers queue for one
 * without bound. Under enough load that queue is where the memory went, and
 * nothing could see it growing, because mysql2 keeps its queue private. This
 * counter is the module's own, so the shedding middleware has a signal that
 * says the database is the bottleneck rather than the event loop.
 */
describe('waitingCount', () => {
  it('is zero when nothing is in flight', () => {
    expect(waitingCount()).toBe(0);
  });

  it('counts the callers currently waiting on the driver', async () => {
    let release;
    poolQuery.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const inFlight = query('SELECT 1');
    expect(waitingCount()).toBe(1);
    release([[], []]);
    await inFlight;
    expect(waitingCount()).toBe(0);
  });

  it('comes back down when a query fails, not only when it succeeds', async () => {
    poolQuery.mockRejectedValueOnce(new Error('connection lost'));
    await expect(query('SELECT 1')).rejects.toThrow('connection lost');
    expect(waitingCount()).toBe(0);
  });
});
