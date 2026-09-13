/**
 * An organization's color, bent into VIA's range.
 *
 * Each organization chooses a color in its settings, usually the color of its
 * own logo. That color is stored exactly as it was given and is never shown
 * exactly as it was given: a neon yellow would be unreadable as a name and a
 * navy would disappear as a lamp, and eighty organizations picking freely would
 * leave the feed looking like a bag of sweets. Before it reaches the page it is
 * bent into the site's range, so it fits everywhere while still saying which
 * organization it belongs to.
 *
 * The work happens in the OKLCH color space, which keeps the hue perceptually
 * steady while the lightness and the chroma move. The hue is kept, the chroma is
 * clamped into the range for the role so that neon calms down and dull colors
 * get a little life, and the lightness is set outright to the value for the role
 * and the theme. A gray stays gray.
 *
 * The method, the role table and the worked examples are in
 * docs/design/04-color.md. This is a pure function of the stored color, the role
 * and the theme, and the same function feeds the event row, the filter rail, the
 * calendar and the poster designer, so that an organization is the same color
 * everywhere on the site.
 */

/** The lightness each role sits at, and the chroma range it is allowed. */
const ROLES = {
  /** The pad, the calendar chip and the switch. */
  mark: { light: 0.56, dark: 0.74, minimumChroma: 0.07, maximumChroma: 0.16 },
  /** The organization's name. */
  text: { light: 0.42, dark: 0.80, minimumChroma: 0.06, maximumChroma: 0.14 },
  /** The light falling across a row or a poster. */
  lamp: { light: 0.62, dark: 0.68, minimumChroma: 0.07, maximumChroma: 0.16 },
};

/** Below this, a color is a gray and is left as one. */
const GRAY = 0.02;

/**
 * How far the chroma comes down at a time when the result falls outside the
 * sRGB gamut. Small enough that the step is invisible, large enough to settle.
 */
const STEP = 0.005;

/** What the site falls back to when an organization has chosen nothing. */
const UNSET = { light: '#4d6667', dark: '#8fa8a8' };

const toLinear = channel => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const toGamma = channel => (channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055);

/** A three or six digit hex color as red, green and blue between zero and one. */
function parse(color) {
  if (typeof color !== 'string') return null;
  const text = color.trim().replace(/^#/, '');
  const full = text.length === 3 ? text.split('').map(digit => digit + digit).join('') : text;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map(at => parseInt(full.slice(at, at + 2), 16) / 255);
}

function format(rgb) {
  return `#${rgb
    .map(channel => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** sRGB to OKLab, after Bjorn Ottosson. */
function toOklab([red, green, blue]) {
  const r = toLinear(red);
  const g = toLinear(green);
  const b = toLinear(blue);
  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * long + 0.7936177850 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.4285922050 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.8086757660 * short,
  ];
}

/** OKLab back to sRGB, which may land outside the gamut. */
function toRgb([lightness, a, b]) {
  const long = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.7076147010 * short,
  ].map(toGamma);
}

const inGamut = rgb => rgb.every(channel => channel >= -0.0001 && channel <= 1.0001);

/**
 * An organization's color as the site draws it.
 *
 * @param {string|null|undefined} stored the color the organization chose
 * @param {'mark'|'text'|'lamp'} role what it is being drawn as
 * @param {'light'|'dark'} theme which theme the page is in
 * @returns {string} a six digit hex color
 */
export function organizationColor(stored, role, theme = 'light') {
  /*
   * Object.hasOwn, because every plain object inherits constructor, toString and
   * the rest from Object.prototype. A plain lookup took each of those for a hit,
   * and what came back had no lightness in it, so the search that walks the
   * chroma down to the role's lightness compared against a number that is not a
   * number and never finished.
   */
  if (!Object.hasOwn(ROLES, role)) throw new Error(`there is no ${role} role for an organization color`);
  const spec = ROLES[role];
  const which = theme === 'dark' ? 'dark' : 'light';

  const rgb = parse(stored);
  if (!rgb) return UNSET[which];

  const [, a, b] = toOklab(rgb);
  const hue = Math.atan2(b, a);
  const given = Math.hypot(a, b);
  const lightness = spec[which];

  // A gray has no hue worth keeping, so it stays a gray at the role's lightness
  // rather than being given a color it never had.
  let chroma = given < GRAY
    ? 0
    : Math.min(Math.max(given, spec.minimumChroma), spec.maximumChroma);

  // The hue and the lightness are fixed, so the only thing left to give up when
  // the result falls outside the gamut is chroma.
  for (;;) {
    const candidate = toRgb([lightness, Math.cos(hue) * chroma, Math.sin(hue) * chroma]);
    if (chroma <= 0 || inGamut(candidate)) return format(candidate);
    chroma -= STEP;
  }
}

/**
 * The three roles at once, which is what a component drawing a row needs.
 *
 * @param {string|null|undefined} stored
 * @param {'light'|'dark'} theme
 * @returns {{ mark: string, text: string, lamp: string }}
 */
export function organizationColors(stored, theme = 'light') {
  return {
    mark: organizationColor(stored, 'mark', theme),
    text: organizationColor(stored, 'text', theme),
    lamp: organizationColor(stored, 'lamp', theme),
  };
}
