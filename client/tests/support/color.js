/**
 * The colour arithmetic the design system does, done the same way here.
 *
 * The stylesheet reaches its readable pairs through color-mix in sRGB and
 * through gradients that are read at their first stop, so a test that only
 * compared flat tokens would miss the surfaces people actually read text on.
 */

/** A hex token as red, green and blue between zero and one. */
export function rgbOf(token) {
  const text = String(token).trim().replace('#', '');
  const full = text.length === 3 ? text.split('').map(c => c + c).join('') : text;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${token}`);
  return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16) / 255);
}

const clamp = value => Math.max(0, Math.min(1, value));

/** Red, green and blue between zero and one, written back as a hex token. */
export function hexOf(rgb) {
  return `#${rgb.map(c => Math.round(clamp(c) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** `color-mix(in srgb, top percent%, bottom)`. */
export function mix(top, percent, bottom) {
  const under = rgbOf(bottom);
  return hexOf(rgbOf(top).map((c, at) => c * (percent / 100) + under[at] * (1 - percent / 100)));
}

/** `color-mix(in srgb, colour percent%, transparent)` laid over a surface. */
export function over(colour, percent, surface) {
  return mix(colour, percent, surface);
}

const luminance = rgb => {
  const [r, g, b] = rgb.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The Web Content Accessibility Guidelines contrast ratio of two colours. */
export function contrast(a, b) {
  const [high, low] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * The colour a sky gradient starts at, which is its top edge.
 *
 * Contrast on a band is lowest where the band is lightest in the light theme
 * and darkest in the dark theme, and for every sky in the system that is the
 * first stop, so that is the stop the pairs are measured at.
 */
export function firstStop(gradient) {
  const stop = /#[0-9a-f]{3,8}/i.exec(String(gradient).replace(/^[^,]*,/, ''));
  if (!stop) throw new Error(`no colour stop in: ${gradient}`);
  return stop[0];
}

/** Every colour stop of a gradient, in order. */
export function stopsOf(gradient) {
  return [...String(gradient).replace(/^[^,]*,/, '').matchAll(/#[0-9a-f]{3,8}/gi)].map(m => m[0]);
}
