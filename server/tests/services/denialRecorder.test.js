import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const upsertDenialBuckets = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const pruneDenials = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../db/queries/accessDenials.js', () => ({
  upsertDenialBuckets, pruneDenials, getDenialSeries: vi.fn(),
}));

const { recordDenial, flushDenials, bufferSize, resetRecorder } =
  await import('../../services/denialRecorder.js');

beforeEach(() => {
  resetRecorder();
  upsertDenialBuckets.mockClear();
  pruneDenials.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-03T14:05:37'));
});
afterEach(() => vi.useRealTimers());

/**
 * The recorder exists so that refusing a request stays cheap. Under load it is
 * called on the hot path of every refusal, so it does arithmetic in a map and
 * nothing else, and one write a minute carries the result.
 */
describe('recordDenial', () => {
  it('buckets by the minute, discarding the seconds', async () => {
    recordDenial({ reason: 'overloaded', route: '/api/v1/events', authenticated: false, client: '203.0.113.9' });
    await flushDenials();
    expect(upsertDenialBuckets).toHaveBeenCalledWith([
      expect.objectContaining({ bucketStart: '2026-09-03 14:05:00' }),
    ]);
  });

  it('adds repeated refusals of the same shape into one row', async () => {
    for (let i = 0; i < 5; i++) {
      recordDenial({ reason: 'overloaded', route: '/api/v1/events', authenticated: false, client: '203.0.113.9' });
    }
    await flushDenials();
    expect(upsertDenialBuckets.mock.calls[0][0][0].denialCount).toBe(5);
  });

  it('counts one client refused five times as one client', async () => {
    for (let i = 0; i < 5; i++) {
      recordDenial({ reason: 'overloaded', route: '/api/v1/events', authenticated: false, client: '203.0.113.9' });
    }
    await flushDenials();
    expect(upsertDenialBuckets.mock.calls[0][0][0].clientCount).toBe(1);
  });

  it('counts five clients refused once as five clients', async () => {
    for (let i = 0; i < 5; i++) {
      recordDenial({ reason: 'row_budget', route: '/api/v1/events', authenticated: false, client: `203.0.113.${i}` });
    }
    await flushDenials();
    expect(upsertDenialBuckets.mock.calls[0][0][0].clientCount).toBe(5);
  });

  it('keeps reasons and routes apart', async () => {
    recordDenial({ reason: 'overloaded', route: '/api/v1/events', authenticated: false, client: 'a' });
    recordDenial({ reason: 'row_budget', route: '/api/v1/events', authenticated: false, client: 'a' });
    recordDenial({ reason: 'overloaded', route: '/api/v1/rsos', authenticated: false, client: 'a' });
    await flushDenials();
    expect(upsertDenialBuckets.mock.calls[0][0]).toHaveLength(3);
  });

  it('empties the buffer once it has been written', async () => {
    recordDenial({ reason: 'overloaded', route: '/api/v1/events', authenticated: false, client: 'a' });
    expect(bufferSize()).toBe(1);
    await flushDenials();
    expect(bufferSize()).toBe(0);
  });

  it('writes nothing at all when there is nothing to write', async () => {
    await flushDenials();
    expect(upsertDenialBuckets).not.toHaveBeenCalled();
  });

  it('drops the buffer rather than retrying when the database refuses it', async () => {
    upsertDenialBuckets.mockRejectedValueOnce(new Error('database unavailable'));
    recordDenial({ reason: 'overloaded', route: '/api/v1/events', authenticated: false, client: 'a' });
    await expect(flushDenials()).resolves.toBeUndefined();
    expect(bufferSize()).toBe(0);
  });

  it('stops accepting new keys past its bound, so telemetry is never the leak', () => {
    for (let i = 0; i < 6000; i++) {
      recordDenial({ reason: 'overloaded', route: `/api/v1/r${i}`, authenticated: false, client: 'a' });
    }
    expect(bufferSize()).toBe(5000);
  });

  it('still counts a refusal whose key is already buffered, once at the bound', async () => {
    for (let i = 0; i < 6000; i++) {
      recordDenial({ reason: 'overloaded', route: `/api/v1/r${i}`, authenticated: false, client: 'a' });
    }
    recordDenial({ reason: 'overloaded', route: '/api/v1/r0', authenticated: false, client: 'b' });
    await flushDenials();
    const first = upsertDenialBuckets.mock.calls[0][0].find(r => r.route === '/api/v1/r0');
    expect(first.denialCount).toBe(2);
  });
});
