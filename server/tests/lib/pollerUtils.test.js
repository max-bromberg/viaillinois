import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/queries/pollLog.js', () => ({
  insertPollLog:            vi.fn().mockResolvedValue(99),
  finalizePollLog:          vi.fn().mockResolvedValue(undefined),
  insertUnknownBuildingCode: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/locationNormalizer.js', () => ({
  resolveBuilding: vi.fn(s => s),
  resolveRoom:     vi.fn(s => s),
  drainUnknownCodes: vi.fn().mockReturnValue([]),
}));

import { insertPollLog, finalizePollLog, insertUnknownBuildingCode } from '../../db/queries/pollLog.js';
import { drainUnknownCodes } from '../../lib/locationNormalizer.js';
import { runWithLogging, startPollerRun } from '../../lib/pollerUtils.js';

beforeEach(() => vi.clearAllMocks());

describe('runWithLogging()', () => {
  it('inserts a log row, calls runOnceFn, then finalizes', async () => {
    const runOnceFn = vi.fn().mockResolvedValue({ upserted: 3, skipped: 1 });
    await runWithLogging('facilities', runOnceFn);
    expect(insertPollLog).toHaveBeenCalledWith('facilities', expect.any(Date));
    expect(runOnceFn).toHaveBeenCalledTimes(1);
    expect(finalizePollLog).toHaveBeenCalledWith(99, expect.objectContaining({
      rowsProcessed: 3,
      rowsSkipped: 1,
      errorCount: 0,
    }));
  });

  it('normalizes courses stats into rowsProcessed = totalCourses + totalSections', async () => {
    const runOnceFn = vi.fn().mockResolvedValue({ totalCourses: 10, totalSections: 50, totalErrors: 2 });
    await runWithLogging('courses', runOnceFn);
    expect(finalizePollLog).toHaveBeenCalledWith(99, expect.objectContaining({
      rowsProcessed: 60,
      rowsSkipped: 0,
      errorCount: 2,
      metadata: { totalCourses: 10, totalSections: 50 },
    }));
  });

  it('inserts each drained unknown code', async () => {
    drainUnknownCodes.mockReturnValue(['NSRC', 'FAKE']);
    const runOnceFn = vi.fn().mockResolvedValue({ upserted: 0, skipped: 0 });
    await runWithLogging('astra', runOnceFn);
    expect(insertUnknownBuildingCode).toHaveBeenCalledWith(99, 'NSRC');
    expect(insertUnknownBuildingCode).toHaveBeenCalledWith(99, 'FAKE');
  });

  it('finalizes with error details when runOnceFn throws', async () => {
    const runOnceFn = vi.fn().mockRejectedValue(new Error('Network timeout'));
    await expect(runWithLogging('astra', runOnceFn)).rejects.toThrow('Network timeout');
    expect(finalizePollLog).toHaveBeenCalledWith(99, expect.objectContaining({
      errorCount: 1,
      lastError: 'Network timeout',
    }));
  });

  it('drains unknown codes even when runOnceFn throws', async () => {
    drainUnknownCodes.mockReturnValue(['ORPHAN']);
    const runOnceFn = vi.fn().mockRejectedValue(new Error('Network timeout'));
    await expect(runWithLogging('astra', runOnceFn)).rejects.toThrow('Network timeout');
    expect(drainUnknownCodes).toHaveBeenCalled();
    expect(insertUnknownBuildingCode).not.toHaveBeenCalled();
  });

  it('proceeds silently when insertPollLog throws Not implemented', async () => {
    insertPollLog.mockRejectedValueOnce(new Error('Not implemented'));
    const runOnceFn = vi.fn().mockResolvedValue({ upserted: 1, skipped: 0 });
    await expect(runWithLogging('astra', runOnceFn)).resolves.not.toThrow();
    expect(runOnceFn).toHaveBeenCalled();
  });
});

describe('startPollerRun()', () => {
  it('returns logId immediately without awaiting the run', async () => {
    const runOnceFn = vi.fn().mockResolvedValue({ upserted: 1, skipped: 0 });
    const logId = await startPollerRun('facilities', runOnceFn);
    expect(logId).toBe(99);
    expect(insertPollLog).toHaveBeenCalled();
  });

  it('returns undefined when insertPollLog throws Not implemented', async () => {
    insertPollLog.mockRejectedValueOnce(new Error('Not implemented'));
    const runOnceFn = vi.fn().mockResolvedValue({ upserted: 0, skipped: 0 });
    const logId = await startPollerRun('facilities', runOnceFn);
    expect(logId).toBeUndefined();
  });
});
