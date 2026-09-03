/**
 * Whether VIA is overloaded, and by how much.
 *
 * Each signal is divided by its own threshold, so the answer is a ratio and
 * nothing here has to know how large the host is or how many other
 * applications are sharing it. The worst of the three ratios decides the
 * level, because being fine on two signals is no comfort while the third is
 * the one running out.
 *
 * Hysteresis matters more than it looks. Without it, a signal sitting on its
 * threshold would enter and leave shedding on alternate samples, and callers
 * would see a refusal, then an answer, then a refusal, which is worse than
 * either state held steadily.
 */

/** Ratio at which each further tier of traffic starts being refused. */
const LEVEL_RATIOS = [1, 1.5, 2, 3];

/**
 * @param {{
 *   thresholds: { lagMs: number, inFlight: number, dbWaiters: number },
 *   recoveryRatio: number,
 *   readSignals: () => { lagMs: number, inFlight: number, dbWaiters: number },
 * }} options
 */
export function createOverloadState({ thresholds, recoveryRatio, readSignals }) {
  let engaged = false;

  function worstRatio() {
    const signals = readSignals();
    return Math.max(
      signals.lagMs / thresholds.lagMs,
      signals.inFlight / thresholds.inFlight,
      signals.dbWaiters / thresholds.dbWaiters,
    );
  }

  return {
    /**
     * How many tiers of traffic to refuse: 0 refuses nothing, 4 refuses
     * everything except the health endpoint.
     * @returns {number}
     */
    level() {
      const ratio = worstRatio();
      // Once engaged, a signal has to fall well clear of its threshold before
      // shedding stops, so the state cannot flap once per sample.
      const floor = engaged ? recoveryRatio : 1;
      if (ratio < floor) {
        engaged = false;
        return 0;
      }
      engaged = true;
      let level = 1;
      LEVEL_RATIOS.forEach((boundary, index) => {
        if (ratio >= boundary) level = index + 1;
      });
      return level;
    },
    /** Exposed for the admin surface and for tests. */
    ratio: worstRatio,
  };
}
