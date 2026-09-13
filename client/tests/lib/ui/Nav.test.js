import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { Nav } from '../../../src/lib/components/ui/Nav/index.js';

/**
 * The navigation sits in the sky band. The mark is at its left with the site's
 * full name beside it, the links run in the display face, and the page you are
 * on is set at 800 with a pad under it. The pad is the same shape as the day
 * marker and the checkbox, which is the point of having one primitive.
 */
const LINKS = [
  { href: '/', label: 'Events' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/midterms', label: 'Midterms' },
  { href: '/about', label: 'About' },
];

describe('Nav', () => {
  it('is the navigation of the page, and says so', () => {
    const { container } = render(Nav, { links: LINKS, here: '/' });
    const nav = container.querySelector('nav.nav');
    expect(nav).toBeTruthy();
    expect(nav.getAttribute('aria-label')).toBe('Main');
  });

  it('carries the mark and the site full name', () => {
    const { container } = render(Nav, { links: LINKS, here: '/' });
    expect(container.querySelector('svg.mark')).toBeTruthy();
    expect(container.querySelector('.w').textContent).toBe('Virtually Integrated Agenda');
  });

  it('marks the page you are on, in words as well as in weight', () => {
    const { container } = render(Nav, { links: LINKS, here: '/midterms' });
    const current = container.querySelector('[aria-current="page"]');
    // The link is what is current, so the link is what says so. The weight and
    // the pad under it come from the b around it, which is the element the
    // stylesheet draws the marker on.
    expect(current.tagName).toBe('A');
    expect(current.textContent.trim()).toBe('Midterms');
    expect(current.closest('b')).toBeTruthy();
  });

  it('marks only one page at a time', () => {
    const { container } = render(Nav, { links: LINKS, here: '/calendar' });
    expect(container.querySelectorAll('[aria-current="page"]').length).toBe(1);
  });

  it('draws the mark in white on the night sky, where its teal would disappear', () => {
    const { container } = render(Nav, { links: LINKS, here: '/', onDark: true });
    expect(container.querySelector('svg.mark').getAttribute('fill')).toBe('#ffffff');
  });

  it('gives every link somewhere to go', () => {
    const { container } = render(Nav, { links: LINKS, here: '/' });
    for (const link of container.querySelectorAll('.links a')) {
      expect(link.getAttribute('href')).toBeTruthy();
    }
  });

  it('has room at its right for the theme control and for signing in', () => {
    const { container } = render(Nav, { links: LINKS, here: '/' });
    expect(container.querySelector('.right')).toBeTruthy();
  });
});
