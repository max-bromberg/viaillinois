/**
 * How much one caller may spend in a rolling window.
 *
 * Sliding rather than fixed. A fixed window lets a caller spend the whole
 * budget in the last second of one window and the whole budget again in the
 * first second of the next, which is twice the rate the number claims, and
 * that hole is exactly the one a client trying to collect the corpus would
 * find. Each caller's spends are kept as timestamped amounts, and the ones
 * that have aged out are dropped as they are read.
 *
 * The same primitive counts requests and rows. Counting rows is the useful one
 * for scraping, because it measures what was taken rather than how it was
 * asked for, and a patient client pacing itself to look human still has to
 * take the rows.
 */

/**
 * @param {{ windowMs: number, max: number, now?: () => number }} options
 */
export function createSlidingBudget({ windowMs, max, now = Date.now }) {
  /** key -> Array<[timestamp, amount]> */
  const spends = new Map();

  function live(key, at) {
    const cutoff = at - windowMs;
    const kept = (spends.get(key) || []).filter(([when]) => when > cutoff);
    if (kept.length) spends.set(key, kept); else spends.delete(key);
    return kept;
  }

  return {
    /**
     * Try to spend against a caller's budget. An amount of zero asks only
     * whether the caller is already out, which is how the row budget refuses
     * somebody before running the query whose rows it would have to charge for.
     * @param {string} key
     * @param {number} amount
     * @returns {{ allowed: boolean, retryAfterSeconds: number }}
     */
    consume(key, amount = 1) {
      const at = now();
      const kept = live(key, at);
      const spent = kept.reduce((total, [, value]) => total + value, 0);

      if (spent + amount > max || (amount === 0 && spent >= max)) {
        // Wait until the oldest spend ages out, which is the soonest moment
        // there could be room. Never longer than the window itself.
        const oldest = kept.length ? kept[0][0] : at;
        const waitMs = Math.max(0, oldest + windowMs - at);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
      }

      if (amount > 0) {
        kept.push([at, amount]);
        spends.set(key, kept);
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },

    /**
     * Record a spend that has already happened, without asking permission.
     *
     * Rows are charged once the response has gone out, so refusing the charge
     * would only lose the count: the caller has the rows either way. consume()
     * is the right shape for asking whether something may happen, and this is
     * the right shape for recording that it did.
     * @param {string} key
     * @param {number} amount
     */
    charge(key, amount) {
      if (!(amount > 0)) return;
      const at = now();
      const kept = live(key, at);
      kept.push([at, amount]);
      spends.set(key, kept);
    },

    /** Drop callers whose spends have all aged out. */
    sweep() {
      const at = now();
      for (const key of [...spends.keys()]) live(key, at);
    },

    /** How many callers are being tracked. */
    size() {
      return spends.size;
    },
  };
}
