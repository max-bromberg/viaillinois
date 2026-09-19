import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/svelte';
import { Sky } from '../../../src/lib/components/ui/Sky/index.js';

/**
 * The secondary button standing on the sky.
 *
 * "Sign out" sits in the sky band, and a cut secondary button is two layers: the
 * button's own background is the border colour, and a chamfered layer inset by
 * the border width covers everything but the ring. The band told that inner
 * layer to be transparent so that the sky would show through it, which let the
 * border colour, --ink, fill the whole button instead. The label is --ink too,
 * so the button became a solid block with nothing readable on it.
 *
 * The band names the colour of the sky above it instead, the same way the night
 * band already did, so the inner layer is the sky rather than a hole in the
 * button.
 */
describe('a secondary button standing on the sky', () => {
  const APP = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

  it('is never given a transparent fill, which would show its own border colour', () => {
    const rule = /\.skyband[^{}]*\.btn\.secondary\.cut::before\s*\{([^}]*)\}/.exec(APP);
    expect(rule?.[1] ?? '').not.toContain('transparent');
  });

  it.each([
    ['morning', '--sky-morning-top'],
    ['afternoon', '--sky-afternoon-top'],
    ['dusk', '--sky-evening-top'],
    ['night', '--sky-night-top'],
  ])('fills with the colour of the %s sky above it', (sky, token) => {
    const { container } = render(Sky, { sky });
    expect(container.querySelector('.skyband').getAttribute('style'))
      .toContain(`--btn-fill: var(${token})`);
  });

  /**
   * Every sky the band can paint has a colour named for the top of it, in both
   * themes, or a button would fill with nothing on the sky that has none.
   */
  it.each(['--sky-morning-top', '--sky-afternoon-top', '--sky-evening-top', '--sky-night-top'])(
    'has %s in the light theme and in the dark one',
    token => {
      const blocks = APP.split(/(?=:root|\.dark)/);
      const declaring = blocks.filter(block => block.includes(`${token}:`));
      expect(declaring.length).toBeGreaterThanOrEqual(2);
    },
  );
});
