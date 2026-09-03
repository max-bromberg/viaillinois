import { describe, it, expect } from 'vitest';
import { createSlidingBudget } from '../../lib/slidingBudget.js';

/** A clock under the test's control, so no test waits for a real minute. */
function clockAt(start) {
  let value = start;
  return { now: () => value, advance: ms => { value += ms; } };
}

/**
 * A fixed window lets a caller spend the whole budget at the end of one window
 * and the whole budget again at the start of the next, which is twice the rate
 * the number says. A sliding window costs one more number per caller and does
 * not have that hole.
 */
describe('createSlidingBudget', () => {
  it('allows spending up to the maximum', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 10, now: clock.now });
    for (let i = 0; i < 10; i++) {
      expect(budget.consume('a', 1).allowed).toBe(true);
    }
  });

  it('refuses the request that would exceed it', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 10, now: clock.now });
    for (let i = 0; i < 10; i++) budget.consume('a', 1);
    expect(budget.consume('a', 1).allowed).toBe(false);
  });

  it('says how long to wait, in whole seconds', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 1, now: clock.now });
    budget.consume('a', 1);
    clock.advance(20000);
    expect(budget.consume('a', 1).retryAfterSeconds).toBe(40);
  });

  it('keeps callers apart', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 1, now: clock.now });
    budget.consume('a', 1);
    expect(budget.consume('b', 1).allowed).toBe(true);
  });

  it('spends more than one at a time, which is how rows are counted', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 100, now: clock.now });
    expect(budget.consume('a', 60).allowed).toBe(true);
    expect(budget.consume('a', 60).allowed).toBe(false);
  });

  it('lets the window slide rather than resetting it whole', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 2, now: clock.now });
    budget.consume('a', 1);
    clock.advance(30000);
    budget.consume('a', 1);
    expect(budget.consume('a', 1).allowed).toBe(false);
    // The first spend ages out, the second has not.
    clock.advance(31000);
    expect(budget.consume('a', 1).allowed).toBe(true);
  });

  it('forgets a caller who has gone quiet, so the map cannot grow forever', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 10, now: clock.now });
    budget.consume('a', 1);
    expect(budget.size()).toBe(1);
    clock.advance(120000);
    budget.sweep();
    expect(budget.size()).toBe(0);
  });

  /**
   * Rows are charged after the response has gone out, so the spend is a fact
   * rather than a request. consume() refuses a spend that would exceed the
   * maximum, which is right for asking permission and wrong for recording
   * something already served: the overspend would vanish and the total could
   * never pass the maximum that is supposed to stop the next caller.
   */
  it('records a spend that overshoots, because it already happened', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 100, now: clock.now });
    budget.charge('a', 60);
    budget.charge('a', 60);
    expect(budget.consume('a', 0).allowed).toBe(false);
  });

  it('reports a caller who is already out, when asked to spend nothing', () => {
    const clock = clockAt(0);
    const budget = createSlidingBudget({ windowMs: 60000, max: 10, now: clock.now });
    budget.consume('a', 10);
    expect(budget.consume('a', 0).allowed).toBe(false);
    expect(budget.consume('b', 0).allowed).toBe(true);
  });
});
