import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('signs off to the people rather than to the building', () => {
    const { container } = render(Footer);
    expect(container.textContent).toMatch(/Made with .* for Illinois ECE/);
  });

  it('says the year and the version, with the version in mono', () => {
    const { container } = render(Footer);
    expect(container.textContent).toContain(String(new Date().getFullYear()));
    const version = container.querySelector('.mono');
    expect(version.textContent).toMatch(/^v\d/);
  });

  /**
   * No eyebrow captions and no uppercase for emphasis. See
   * docs/design/10-voice.md.
   *
   * The heart in the sign off is the one character on the page standing in for
   * a word, and it is there because it was asked for by name. It is hidden from
   * assistive technology with the word beside it, so nobody hears a decoration
   * read out as punctuation.
   */
  it('shouts at nobody, and draws only the one character it was asked for', () => {
    const { container } = render(Footer);
    expect(container.innerHTML).not.toMatch(/uppercase/);

    const decorative = container.querySelector('.heart');
    expect(decorative.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain('love');

    const rest = container.textContent.replace(decorative.textContent, '');
    expect(rest).not.toMatch(/[\u2600-\u27bf\u{1f300}-\u{1faff}]/u);

    const shouted = rest.match(/\b[A-Z]{4,}\b/g) ?? [];
    expect(shouted.filter(word => !['ECEB', 'UIUC'].includes(word))).toEqual([]);
  });
});

/**
 * The footer carried three blocks of prose: a paragraph under the mark
 * explaining what the site is, and a sign off saying it was made in the
 * building. Both said what the rest of the page already says, and the second
 * tied the platform to a building it is not tied to: the organizations it
 * serves are a department's, and a department is people rather than an address.
 *
 * What is left is the mark at a size that reads as a mark, the places to go in
 * one row, and a short sign off beside the version.
 */
describe('the foot of the page, after the trim', () => {
  it('carries no paragraph under the mark', () => {
    const { container } = render(Footer);
    expect(container.querySelector('.brand p')).toBe(null);
  });

  it('does not tie the platform to a building', () => {
    const { container } = render(Footer);
    expect(container.textContent).not.toMatch(/ECEB/);
    expect(container.textContent).not.toMatch(/lobby screen/);
  });

  it('signs off beside the version rather than in a paragraph of its own', () => {
    const { container } = render(Footer);
    const bottom = container.querySelector('.bottom');
    expect(bottom.textContent).toContain('Made with');
    expect(bottom.textContent).toContain('Illinois ECE');
    expect(bottom.textContent).toMatch(/v\d+\.\d+\.\d+/);
  });

  it('lays the places out in a row rather than down a column', () => {
    const { container } = render(Footer);
    const source = container.ownerDocument;
    expect(source).toBeTruthy();
    // The row is the arrangement, so the rule that arranges it is what is read.
    const css = readFileSync(resolve(process.cwd(), 'src/lib/Footer.svelte'), 'utf8');
    const rule = css.slice(css.indexOf('\n  nav {'), css.indexOf('}', css.indexOf('\n  nav {')));
    expect(rule).not.toContain('flex-direction: column');
  });

  it('draws the mark larger than the one in the band', () => {
    const { container } = render(Footer);
    const mark = container.querySelector('svg.mark');
    expect(Number(mark.getAttribute('width'))).toBeGreaterThan(64);
  });
});
