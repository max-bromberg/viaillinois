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

  it('draws whatever element it is asked for, since the band at the top of a page is its banner', () => {
    const { container } = render(Sky, { as: 'header' });
    expect(container.querySelector('header.skyband')).toBeTruthy();
  });
});

/**
 * The sky is the only component that knows what time it is, and it reads that
 * from the same place the feed does. Step 5 of docs/design/11-implementation.md.
 */
describe('Sky, reading the campus clock', () => {
  const bandOf = container => container.querySelector('.skyband');

  it('paints the sky over the building at the hour it is given', () => {
    const { container } = render(Sky, { at: '2026-09-10T08:15:00-05:00' });
    expect(bandOf(container).getAttribute('style')).toContain('--sky-morning');
  });

  it.each([
    ['2026-09-10T13:00:00-05:00', '--sky-afternoon'],
    ['2026-09-10T19:00:00-05:00', '--sky-evening'],
    ['2026-09-10T23:00:00-05:00', '--sky-night'],
  ])('at %s paints %s', (at, token) => {
    const { container } = render(Sky, { at });
    expect(bandOf(container).getAttribute('style')).toContain(token);
  });

  it('holds one sky steady through the middle of its hours', () => {
    const { container } = render(Sky, { at: '2026-09-10T19:00:00-05:00' });
    expect(container.querySelector('.coming')).toBe(null);
  });

  it('blends the sky that is coming over the one that is going, at the edge of the hour', () => {
    const { container } = render(Sky, { at: '2026-09-10T20:45:00-05:00' });
    const coming = container.querySelector('.coming');
    expect(coming).toBeTruthy();
    expect(coming.getAttribute('style')).toContain('--sky-night');
    expect(coming.getAttribute('style')).toMatch(/opacity: 0\.5/);
    // The band that is going is still the one underneath.
    expect(bandOf(container).getAttribute('style')).toContain('--sky-evening');
  });

  it('keeps the blended sky out of the reading order, since it is only colour', () => {
    const { container } = render(Sky, { at: '2026-09-10T20:45:00-05:00' });
    expect(container.querySelector('.coming').getAttribute('aria-hidden')).toBe('true');
  });

  it('turns the band ink light once the night is the sky being read', () => {
    const { container: early } = render(Sky, { at: '2026-09-10T20:35:00-05:00' });
    expect(bandOf(early).classList.contains('night')).toBe(false);
    const { container: late } = render(Sky, { at: '2026-09-10T20:55:00-05:00' });
    expect(bandOf(late).classList.contains('night')).toBe(true);
  });

  it('holds the sky it is told to hold, and does not crossfade it', () => {
    const { container } = render(Sky, { sky: 'morning', at: '2026-09-10T20:45:00-05:00' });
    expect(bandOf(container).getAttribute('style')).toContain('--sky-morning');
    expect(container.querySelector('.coming')).toBe(null);
  });
});
