import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ambientSchedule } from '../../src/lib/circuitAmbient.js';

/**
 * The board behind a lobby screen.
 *
 * On a reading page the board is still until somebody touches it, which is
 * right: a page that animates while you are trying to read it competes with its
 * own content. A lobby screen has nobody touching it, so that same rule leaves
 * a wall of static lines for weeks at a time.
 *
 * Ambient mode fires the board's own current on a timer instead. The pacing is
 * the whole design: slow enough that it reads as a room's ambient movement
 * rather than as something demanding attention, irregular enough that it does
 * not read as a machine ticking, and stopped completely for anybody who has
 * asked for reduced motion.
 */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the pacing of the board on a kiosk', () => {
  it('waits seconds between pulses rather than firing continuously', () => {
    const gaps = Array.from({ length: 40 }, () => ambientSchedule.nextDelay(() => 0.5));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(ambientSchedule.MIN_MS);
      expect(gap).toBeLessThanOrEqual(ambientSchedule.MAX_MS);
    }
    expect(ambientSchedule.MIN_MS).toBeGreaterThanOrEqual(1500);
  });

  it('varies the gap, so it does not read as a machine ticking', () => {
    const low = ambientSchedule.nextDelay(() => 0);
    const high = ambientSchedule.nextDelay(() => 1);
    expect(low).not.toBe(high);
    expect(low).toBe(ambientSchedule.MIN_MS);
    expect(high).toBe(ambientSchedule.MAX_MS);
  });

  it('runs at all only when it is asked to and motion is welcome', () => {
    expect(ambientSchedule.shouldRun({ ambient: true, reduced: false })).toBe(true);
    expect(ambientSchedule.shouldRun({ ambient: false, reduced: false })).toBe(false);
    expect(ambientSchedule.shouldRun({ ambient: true, reduced: true })).toBe(false);
  });
});
