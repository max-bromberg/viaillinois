/**
 * How often the board fires its own current when nobody is there to touch it.
 *
 * On a reading page the board stays still until the cursor comes near, because
 * a page that animates while you are trying to read it is competing with its
 * own content. A lobby screen has no cursor, so that same rule leaves a wall of
 * static lines for weeks.
 *
 * The pacing is the whole of the design. Slow enough to read as a room's own
 * movement rather than as something asking for attention, irregular enough that
 * it does not read as a machine ticking, and off entirely for anybody who has
 * asked for reduced motion, which on a public screen is a setting the display
 * itself may carry.
 */
export const ambientSchedule = {
  MIN_MS: 2200,
  MAX_MS: 7000,

  /** The gap before the next pulse. */
  nextDelay(random = Math.random) {
    return this.MIN_MS + random() * (this.MAX_MS - this.MIN_MS);
  },

  /** Whether the board should be firing on its own at all. */
  shouldRun({ ambient, reduced }) {
    return Boolean(ambient) && !reduced;
  },
};
