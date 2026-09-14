import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { SkyBand } from '../../../src/lib/components/ui/SkyBand/index.js';

/**
 * The sky band holds the navigation, the greeting and the clock, and ends in a
 * cut at its bottom left. Everything below it is paper. The band is the site's
 * clock, so it follows the campus hour rather than the theme: somebody who chose
 * the light theme still gets a dark band at night, with light ink on it.
 */
const LINKS = [{ href: '/', label: 'Events' }];

describe('SkyBand', () => {
  it('is a banner, holding the navigation, the greeting and the clock', () => {
    const { container } = render(SkyBand, { sky: 'dusk', links: LINKS, here: '/', at: '2026-09-10T18:41:00-05:00' });
    expect(container.querySelector('header.skyband')).toBeTruthy();
    expect(container.querySelector('nav.nav')).toBeTruthy();
    expect(container.querySelector('.greet')).toBeTruthy();
    expect(container.querySelector('.clock')).toBeTruthy();
  });

  it('paints the sky it is given and ends in a cut at its bottom left', () => {
    const { container } = render(SkyBand, { sky: 'morning', links: LINKS, here: '/' });
    const band = container.querySelector('.skyband');
    expect(band.getAttribute('style')).toContain('--sky-morning');
    expect(band.classList.contains('cutbl')).toBe(true);
    expect(band.getAttribute('style')).toContain('--cut: 44px');
  });

  it('turns the band ink light at night and draws the mark in white with it', () => {
    const { container } = render(SkyBand, { sky: 'night', links: LINKS, here: '/' });
    expect(container.querySelector('.skyband').classList.contains('night')).toBe(true);
    expect(container.querySelector('svg.mark').getAttribute('fill')).toBe('#ffffff');
  });

  it('tells the clock which sky is overhead, so the band can say what the hour looks like', () => {
    const { container } = render(SkyBand, {
      sky: 'dusk', links: LINKS, here: '/', at: '2026-09-10T18:41:00-05:00',
    });
    expect(container.querySelector('.clock .d').textContent).toContain('dusk over Urbana');
  });

  it('greets by the hour it is showing', () => {
    const { container } = render(SkyBand, {
      sky: 'morning', links: LINKS, here: '/', at: '2026-09-10T08:15:00-05:00',
    });
    expect(container.querySelector('.greet h2').textContent).toContain('Good morning,');
  });

  it('takes a page title in place of a greeting, which is what a reading page does', () => {
    const { container } = render(SkyBand, {
      sky: 'dusk', links: LINKS, here: '/about', title: 'About VIA',
    });
    expect(container.querySelector('.greet h1').textContent).toBe('About VIA');
  });

  it('lets the page below it stay paper, by holding the sky inside itself', () => {
    const { container } = render(SkyBand, { sky: 'night', links: LINKS, here: '/' });
    // Nothing outside the band carries a sky, which is what keeps the page
    // readable at every hour in both themes.
    expect(container.querySelectorAll('[style*="--sky"]').length).toBe(1);
  });
});
