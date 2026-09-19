import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const addViews = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/eventViews.ts', () => ({ addViews }));

const {
  recordView, flushViews, bufferSize, resetViewRecorder,
  startViewRecorder, stopViewRecorder,
} = await import('../../services/viewRecorder.js');

/**
 * Counting how often an event page is read, without making the reading
 * expensive and without recording who did it.
 *
 * This runs on the hot path of a page every anonymous reader on the site can
 * open, so a reading costs a map lookup and some arithmetic, and one write a
 * minute carries the whole result. That is the arrangement the refusal counts
 * already use, and it is here for the same reason: the moment a page is being
 * read hardest is the moment the database should be asked least.
 *
 * No address, no hash of one, and no session. The row is an event, a day and a
 * number.
 */
beforeEach(() => {
  vi.clearAllMocks();
  addViews.mockResolvedValue(undefined);
  resetViewRecorder();
});

afterEach(() => resetViewRecorder());

describe('counting a reading', () => {
  it('holds it rather than writing it', () => {
    recordView(7);
    recordView(7);
    expect(addViews).not.toHaveBeenCalled();
    expect(bufferSize()).toBe(1);
  });

  it('adds up the readings of one event on one day', async () => {
    recordView(7);
    recordView(7);
    recordView(7);
    await flushViews();
    expect(addViews).toHaveBeenCalledWith([
      expect.objectContaining({ eventId: 7, viewCount: 3 }),
    ]);
  });

  it('keeps one event apart from another', async () => {
    recordView(7);
    recordView(8);
    await flushViews();
    const [rows] = addViews.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.eventId).sort()).toEqual([7, 8]);
  });

  it('files a reading under the campus day it happened on', async () => {
    recordView(7);
    await flushViews();
    const [[row]] = addViews.mock.calls[0];
    expect(row.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('counts nothing for something that is not an event', async () => {
    recordView(null);
    recordView(undefined);
    recordView('seven');
    recordView(-1);
    expect(bufferSize()).toBe(0);
    await flushViews();
    expect(addViews).not.toHaveBeenCalled();
  });
});

describe('the buffer', () => {
  it('is empty again once it has been written', async () => {
    recordView(7);
    await flushViews();
    expect(bufferSize()).toBe(0);
  });

  it('writes nothing when it is holding nothing', async () => {
    await flushViews();
    expect(addViews).not.toHaveBeenCalled();
  });

  /**
   * A write that fails drops what it was holding rather than retrying. A
   * database that cannot take this write should not be asked twice for it, and
   * a view count is the least important thing the platform is doing.
   */
  it('discards what it could not write rather than growing', async () => {
    addViews.mockRejectedValueOnce(new Error('database is down'));
    recordView(7);
    await expect(flushViews()).resolves.toBeUndefined();
    expect(bufferSize()).toBe(0);
  });

  /**
   * Bounded, because a flood of distinct events would otherwise make the
   * counting the memory problem it is supposed to be too cheap to cause.
   */
  it('stops growing past its bound rather than holding everything', () => {
    for (let id = 1; id <= 12_000; id += 1) recordView(id);
    expect(bufferSize()).toBeLessThanOrEqual(10_000);
  });
});

describe('the timer', () => {
  it('writes what is left when it is stopped', async () => {
    startViewRecorder({ intervalMs: 60_000 });
    recordView(7);
    await stopViewRecorder();
    expect(addViews).toHaveBeenCalled();
  });
});
