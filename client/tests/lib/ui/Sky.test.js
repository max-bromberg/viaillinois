import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Sky } from '../../../src/lib/components/ui/Sky/index.js';

/**
 * The sky follows the window rather than the theme. Somebody who chose the light
 * theme still gets a dark band at night, with light ink on it, because the band
 * is the site's clock. The page below the band stays paper, which is the whole
 * reason the sky is confined to a band.
 */
describe('Sky', () => {
  const bandOf = container => container.querySelector('.skyband');

  it.each([
    ['morning', '--sky-morning'],
    ['afternoon', '--sky-afternoon'],
    ['dusk', '--sky-evening'],
    ['night', '--sky-night'],
  ])('paints the %s sky', (sky, token) => {
    const { container } = render(Sky, { sky });
    expect(bandOf(container).getAttribute('style')).toContain(`--sky: var(${token})`);
  });

  it('answers to the name the reference stylesheet uses for dusk as well as to dusk', () => {
    const { container: a } = render(Sky, { sky: 'dusk' });
    const { container: b } = render(Sky, { sky: 'evening' });
    expect(bandOf(a).getAttribute('style')).toBe(bandOf(b).getAttribute('style'));
  });

  it('settles on the afternoon sky rather than nothing when it is given a name it does not know', () => {
    const { container } = render(Sky, { sky: 'twilight' });
    expect(bandOf(container).getAttribute('style')).toContain('--sky-afternoon');
  });

  it('turns the band ink light at night, in either theme', () => {
    const { container } = render(Sky, { sky: 'night' });
    expect(bandOf(container).classList.contains('night')).toBe(true);
  });

  it('leaves the band ink alone at every other hour', () => {
    for (const sky of ['morning', 'afternoon', 'dusk']) {
      const { container } = render(Sky, { sky });
      expect(bandOf(container).classList.contains('night')).toBe(false);
    }
  });

  it('is cut at its bottom left corner, at 44 px', () => {
    const { container } = render(Sky);
    const band = bandOf(container);
    expect(band.classList.contains('cutbl')).toBe(true);
    expect(band.getAttribute('style')).toContain('--cut: 44px');
  });

  it('drifts, which is what says the page is alive at this hour', () => {
    const { container } = render(Sky);
    expect(bandOf(container).classList.contains('drift')).toBe(true);
  });

  it('holds still when it is told to', () => {
    const { container } = render(Sky, { drift: false });
    expect(bandOf(container).classList.contains('drift')).toBe(false);
  });
});
