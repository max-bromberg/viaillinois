/**
 * The colours the poster designer draws with.
 *
 * A poster is drawn onto a canvas and downloaded as an image, so it cannot take
 * its colours from the stylesheet the way every other surface does: a canvas
 * needs a value, not a custom property. This is the one other place values are
 * written out, and tests/lib/posterPalette.test.js holds each of them against
 * the token it claims to be, so the poster cannot drift away from the site it
 * advertises. It used to draw in an indigo and a set of slate greys that appear
 * nowhere else on VIA.
 *
 * See docs/design/04-color.md.
 */

/** The light palette, for the clean poster. */
export const LIGHT = {
  ground: '#f5fafa',   // --paper
  ink: '#0b1a1b',      // --ink
  muted: '#4d6667',    // --muted
  line: '#d3e2e2',     // --line
  onAccent: '#ffffff', // --primary-fg
};

/** The dark palette, for the dark poster and for a dark organization colour. */
export const DARK = {
  ground: '#0a1516',   // --paper, dark
  ink: '#e6f0f0',      // --ink, dark
  muted: '#8fa8a8',    // --muted, dark
  line: '#1f3334',     // --line, dark
  onAccent: '#04201f', // --primary-fg, dark
};

/** What a poster falls back to when the organization has chosen no colour. */
export const DEFAULT_ACCENT = '#007c80'; // --primary

/**
 * Illinois orange, which is spent only on what is happening now or next. The
 * circuit board uses it for the one pad carrying current, and a canvas needs a
 * value rather than a custom property.
 */
export const SIGNAL = '#e84a27'; // --signal

/** Which palette reads on a given ground. */
export function paletteOn(ground) {
  return isDark(ground) ? DARK : LIGHT;
}

/**
 * Whether a colour is dark enough that light text reads on it.
 *
 * The threshold is relative luminance rather than an average of the channels,
 * because a saturated yellow and a saturated blue of the same average are not
 * the same thing to read against.
 */
export function isDark(colour) {
  const text = String(colour ?? '').trim().replace('#', '');
  const full = text.length === 3 ? text.split('').map(digit => digit + digit).join('') : text;
  if (!/^[0-9a-f]{6}$/i.test(full)) return false;
  const channels = [0, 2, 4]
    .map(at => parseInt(full.slice(at, at + 2), 16) / 255)
    .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] < 0.36;
}
