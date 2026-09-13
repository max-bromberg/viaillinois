import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/router.js', () => ({ navigate }));

const Footer = (await import('../../src/lib/Footer.svelte')).default;

beforeEach(() => vi.clearAllMocks());

/**
 * The foot of every page.
 *
 * It carried two headings in uppercase over lists of links, which the voice
 * document rules out, and it signed off with a heart character standing in for
 * an icon, which the review checklist rules out. What is left is the mark, the
 * sign off from the building, the same places to go, and the version.
 */
describe('the footer', () => {
  const hrefOf = (view, name) => view.getByRole('link', { name }).getAttribute('href');

  it('leads to every place the site keeps', () => {
    const view = render(Footer);
    expect(hrefOf(view, 'Events')).toBe('/');
    expect(hrefOf(view, 'Calendar')).toBe('/calendar');
    expect(hrefOf(view, 'Midterms')).toBe('/midterms');
    expect(hrefOf(view, 'Updates')).toBe('/updates');
    expect(hrefOf(view, 'About')).toBe('/about');
    expect(hrefOf(view, 'Terms')).toBe('/terms');
    expect(hrefOf(view, 'Privacy')).toBe('/privacy');
  });

  it('follows a link without reloading the page', async () => {
    const view = render(Footer);
    await fireEvent.click(view.getByRole('link', { name: 'Calendar' }));
    expect(navigate).toHaveBeenCalledWith('/calendar');
  });

  it('draws the mark rather than loading it as an image', () => {
    const { container } = render(Footer);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg.mark')).toBeTruthy();
  });

  it('signs off from the building', () => {
    const { container } = render(Footer);
    expect(container.textContent).toMatch(/Made in ECEB/);
  });

  it('says the year and the version, with the version in mono', () => {
    const { container } = render(Footer);
    expect(container.textContent).toContain(String(new Date().getFullYear()));
    const version = container.querySelector('.mono');
    expect(version.textContent).toMatch(/^v\d/);
  });

  /**
   * No eyebrow captions, no uppercase for emphasis, and no character standing
   * in for an icon. See docs/design/10-voice.md and the review checklist in
   * docs/design/11-implementation.md.
   */
  it('shouts at nobody and draws no emoji', () => {
    const { container } = render(Footer);
    expect(container.innerHTML).not.toMatch(/uppercase/);
    expect(container.textContent).not.toMatch(/[☀-➿\u{1f300}-\u{1faff}]/u);
    const shouted = container.textContent.match(/\b[A-Z]{4,}\b/g) ?? [];
    expect(shouted.filter(word => !['ECEB', 'UIUC'].includes(word))).toEqual([]);
  });
});
