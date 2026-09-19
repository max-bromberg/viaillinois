import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
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

/**
 * The board behind the page is decoration, and it was built and drawn the
 * moment it mounted, which is the same moment the browser is trying to paint
 * the page a reader actually came for. Laying out a circuit and filling a
 * canvas is work worth doing once there is something on the screen, not
 * before, so it waits for a frame to have been painted first.
 */
describe('when the board starts drawing', () => {
  it('waits for a painted frame before it lays anything out', () => {
    const source = readFileSync('src/lib/CircuitBackground.svelte', 'utf8');
    const mounted = source.slice(source.indexOf('onMount(('), source.indexOf('onDestroy(('));

    // The first drawing is reached through a frame rather than run where the
    // component mounts, so it cannot be in the way of the first paint.
    expect(mounted).toMatch(/requestAnimationFrame/);
    const deferred = /const start = \(\) => \{[\s\S]*?\n    \};/.exec(mounted)?.[0] ?? '';
    expect(deferred, 'expected a deferred start').not.toBe('');
    expect(deferred).toContain('init()');
    expect(mounted).toContain('requestAnimationFrame(start)');
  });

  /** A reader who leaves before the frame lands takes the frame with them. */
  it('gives up the frame it is waiting on when the page is left', () => {
    const source = readFileSync('src/lib/CircuitBackground.svelte', 'utf8');
    const leaving = source.slice(source.indexOf('onDestroy(('));
    expect(leaving).toContain('cancelAnimationFrame(startFrame)');
  });
});
