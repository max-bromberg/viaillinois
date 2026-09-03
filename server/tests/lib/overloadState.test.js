import { describe, it, expect } from 'vitest';
import { createOverloadState } from '../../lib/overloadState.js';

const THRESHOLDS = { lagMs: 200, inFlight: 200, dbWaiters: 20 };

/** A state machine with signals supplied by hand, so no load is needed to test it. */
function stateReading(signals) {
  let current = signals;
  const state = createOverloadState({
    thresholds: THRESHOLDS,
    recoveryRatio: 0.6,
    readSignals: () => current,
  });
  return { state, set: next => { current = next; } };
}

const CALM = { lagMs: 5, inFlight: 3, dbWaiters: 0 };

/**
 * Every signal is a ratio against its own threshold, so none of them depends
 * on knowing the size of the host. The worst ratio decides the level, and the
 * level decides which tiers of traffic are refused.
 */
describe('createOverloadState', () => {
  it('sheds nothing while every signal is under its threshold', () => {
    const { state } = stateReading(CALM);
    expect(state.level()).toBe(0);
  });

  it('sheds anonymous reads as soon as one signal crosses', () => {
    const { state, set } = stateReading(CALM);
    set({ ...CALM, lagMs: 220 });
    expect(state.level()).toBe(1);
  });

  it('takes its level from the worst signal, not the average', () => {
    const { state, set } = stateReading(CALM);
    set({ lagMs: 5, inFlight: 3, dbWaiters: 45 });
    expect(state.level()).toBe(3);
  });

  it('sheds everything but health when a signal is three times over', () => {
    const { state, set } = stateReading(CALM);
    set({ ...CALM, inFlight: 700 });
    expect(state.level()).toBe(4);
  });

  it('stays engaged while a signal hovers just under the threshold', () => {
    const { state, set } = stateReading(CALM);
    set({ ...CALM, lagMs: 220 });
    expect(state.level()).toBe(1);
    set({ ...CALM, lagMs: 190 });
    expect(state.level()).toBe(1);
  });

  it('lets go once the signal has really receded', () => {
    const { state, set } = stateReading(CALM);
    set({ ...CALM, lagMs: 220 });
    expect(state.level()).toBe(1);
    set({ ...CALM, lagMs: 110 });
    expect(state.level()).toBe(0);
  });
});
