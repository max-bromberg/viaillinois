/**
 * Which of the eight hues a tag is drawn in.
 *
 * docs/design/04-color.md gives eight hues, matched in lightness so that no tag
 * shouts, and says a tag is assigned one by the platform when it is created,
 * never by the person filing an event. The platform does not store a hue yet, so
 * until it does the hue is derived from the tag's name.
 *
 * Either way the tag has to be the same colour everywhere on the site. Read off
 * a position in a list, "Free Food" would be teal in the filter rail and rose on
 * a row two pages later, because the lists are built by different queries in
 * different orders.
 */

/** The eight hues, as tokens. */
export const HUES = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)', 'var(--cat-7)', 'var(--cat-8)'];

/**
 * A small, stable hash of a string.
 *
 * It has to give the same answer in every browser and on every release, so it is
 * written out rather than taken from anything that might be tuned later.
 */
function hash(text) {
  let value = 0;
  for (let at = 0; at < text.length; at += 1) {
    value = (value * 31 + text.charCodeAt(at)) >>> 0;
  }
  return value;
}

/**
 * The hue for a tag.
 *
 * @param {string|null|undefined} name the tag's name
 * @param {number} [assigned] the hue the platform gave it, from 1 to 8
 * @returns {string} one of the eight hue tokens
 */
export function tagHue(name, assigned = undefined) {
  if (Number.isInteger(assigned) && assigned >= 1 && assigned <= HUES.length) {
    return HUES[assigned - 1];
  }
  const text = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (text === '') return HUES[0];
  return HUES[hash(text) % HUES.length];
}
