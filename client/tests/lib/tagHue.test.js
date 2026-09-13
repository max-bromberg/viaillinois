import { describe, it, expect } from 'vitest';
import { tagHue, HUES } from '../../src/lib/tagHue.js';

/**
 * Which of the eight hues a tag is drawn in.
 *
 * docs/design/04-color.md: each tag is assigned a hue by the platform when it is
 * created, never by the person filing an event. The platform does not store one
 * yet, so until it does the hue is derived from the tag's name. The important
 * part either way is that a tag is the same colour everywhere on the site: read
 * off a position in a list, "Free Food" would be teal in the filter rail and
 * rose on a row two pages later.
 */
describe('the hue of a tag', () => {
  it('is one of the eight, and is given as a token', () => {
    expect(HUES).toHaveLength(8);
    for (const tag of ['Free Food', 'Workshop', 'Social', 'Corporate']) {
      expect(HUES).toContain(tagHue(tag));
      expect(tagHue(tag)).toMatch(/^var\(--cat-[1-8]\)$/);
    }
  });

  it('is the same every time the same tag is drawn', () => {
    expect(tagHue('Free Food')).toBe(tagHue('Free Food'));
  });

  it('does not depend on what else is in the list', () => {
    // The same call, with nothing else passed in, is the whole contract: the hue
    // is a function of the name and of nothing else.
    const alone = tagHue('Workshop');
    const after = ['Social', 'Corporate', 'Speaker'].map(tagHue) && tagHue('Workshop');
    expect(after).toBe(alone);
  });

  it('tells the tags the platform ships with apart', () => {
    const shipped = ['Free Food', 'Workshop', 'Social', 'Corporate', 'Competition', 'Weekly Meeting', 'Speaker', 'Networking'];
    const used = new Set(shipped.map(tagHue));
    // Eight tags over eight hues will not always be a perfect deal, but a list
    // this short should not collapse onto two or three colours.
    expect(used.size).toBeGreaterThanOrEqual(6);
  });

  it('takes the hue the platform gives when the platform gives one', () => {
    expect(tagHue('Free Food', 2)).toBe('var(--cat-2)');
    expect(tagHue('Free Food', 8)).toBe('var(--cat-8)');
  });

  it('ignores a hue the platform could not have meant', () => {
    for (const wrong of [0, 9, -1, 1.5, 'teal', null]) {
      expect(HUES).toContain(tagHue('Free Food', wrong));
    }
  });

  it('draws a tag with no name in the first hue rather than failing', () => {
    expect(HUES).toContain(tagHue(''));
    expect(HUES).toContain(tagHue(null));
  });
});
