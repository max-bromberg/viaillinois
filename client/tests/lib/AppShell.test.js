import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, waitFor } from '@testing-library/svelte';

const getMe = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/users.js', () => ({ getMe }));
vi.mock('../../src/api/events.js', () => ({ getEvents: vi.fn().mockResolvedValue({ events: [], total: 0 }) }));
vi.mock('../../src/api/rsos.js', () => ({ getRsos: vi.fn().mockResolvedValue({ rsos: [] }) }));
vi.mock('../../src/api/midterms.js', () => ({ getConfirmedMidterms: vi.fn().mockResolvedValue({ midterms: [] }) }));
// jsdom draws no canvas, and the circuit board behind the page asks one for a
// drawing context the moment it mounts.
vi.mock('../../src/lib/CircuitBackground.svelte', async () => ({
  default: (await import('../stubs/Empty.svelte')).default,
}));

const App = (await import('../../src/App.svelte')).default;
const { currentUser } = await import('../../src/stores/auth.js');
const { themeMode } = await import('../../src/stores/theme.js');
const { currentPath } = await import('../../src/lib/router.js');

/**
 * The shell every page is drawn inside.
 *
 * The sky band replaced the navigation bar. That is the largest single change in
 * the conversion, so what it has to keep doing is pinned here: the same places to
 * go, the same account controls, the same theme control, and paper under the
 * band rather than a sky running down the page.
 */
beforeEach(() => {
  getMe.mockReset();
  getMe.mockRejectedValue(new Error('not signed in'));
  currentUser.set(null);
  themeMode.set('light');
  history.replaceState(null, '', '/');
  currentPath.set('/');
});

describe('the shell', () => {
  it('draws the sky band at the top of the page', async () => {
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('header.skyband')).toBeTruthy());
  });

  it('keeps every place the navigation bar went', async () => {
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.nav')).toBeTruthy());
    const going = [...container.querySelectorAll('.nav .links a')].map(link => link.getAttribute('href'));
    expect(going).toEqual(['/', '/calendar', '/organizations', '/midterms', '/about']);
  });

  it('marks the page that is open', async () => {
    currentPath.set('/midterms');
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('[aria-current="page"]')).toBeTruthy());
    expect(container.querySelector('[aria-current="page"]').textContent.trim()).toBe('Midterms');
  });

  it('offers the theme control, as the dial', async () => {
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.dial')).toBeTruthy());
    expect(container.querySelector('.dial').getAttribute('role')).toBe('radiogroup');
  });

  it('offers a way in when nobody is signed in', async () => {
    const { findByRole } = render(App);
    expect(await findByRole('link', { name: 'Sign in' })).toBeTruthy();
  });

  /**
   * The band said the net id, which is an identifier the platform uses rather
   * than anything a person calls themselves. The greeting under it was already
   * using the first name, so the two halves of the same band named the same
   * reader two different ways.
   */
  it('offers the account by name, and a way out, when somebody is signed in', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', full_name: 'Jane Doe', memberships: [] } });
    const { findByRole } = render(App);
    expect(await findByRole('link', { name: 'Jane' })).toBeTruthy();
    expect(await findByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('falls back to the net id for somebody the directory has no name for', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', full_name: null, memberships: [] } });
    const { findByRole } = render(App);
    expect(await findByRole('link', { name: 'jdoe2' })).toBeTruthy();
  });

  it('reads the given name when the directory writes the family name first', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', full_name: 'Doe, Jane', memberships: [] } });
    const { findByRole } = render(App);
    expect(await findByRole('link', { name: 'Jane' })).toBeTruthy();
  });

  it('greets a signed in person by their first name', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', full_name: 'Jane Doe', memberships: [] } });
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.greet h2 b')?.textContent).toBe('Jane.'));
  });

  it('greets Illinois when nobody is signed in', async () => {
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.greet h2 b')?.textContent).toBe('Illinois.'));
  });

  /**
   * The sky lives only in the top band. Everything below it is paper, which is
   * what keeps the page readable at every hour in both themes.
   */
  it('keeps the sky in the band and paper under it', async () => {
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.skyband')).toBeTruthy());
    const skies = container.querySelectorAll('[style*="--sky:"]');
    expect(skies.length).toBe(1);
    expect(skies[0].classList.contains('skyband')).toBe(true);
  });

  it('keeps the kiosk out of the shell, because the kiosk is the whole screen', async () => {
    currentPath.set('/kiosk');
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.skyband')).toBe(null));
  });

  it('writes the theme onto the document as a class and as an attribute', async () => {
    render(App);
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));
    themeMode.set('dark');
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });
  });

  it('lets the keyboard skip past the band to the agenda', async () => {
    const { findByRole } = render(App);
    const skip = await findByRole('link', { name: /skip to/i });
    expect(skip.getAttribute('href')).toBe('#agenda');
  });
});

/**
 * The band and the agenda read one clock.
 *
 * Step 5 of docs/design/11-implementation.md. Before this the shell worked the
 * sky out from the hour and handed it to the band, which meant two places knew
 * what time it was and either could be changed without the other.
 */
describe('the sky in the shell', () => {
  it('is decided by the band from the campus clock, not handed to it', async () => {
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.skyband')).toBeTruthy());
    const band = container.querySelector('.skyband');
    const { campusSky } = await import('../../src/lib/campusTime.js');
    const token = {
      morning: '--sky-morning',
      afternoon: '--sky-afternoon',
      dusk: '--sky-evening',
      night: '--sky-night',
    }[campusSky(new Date()).sky];
    expect(band.getAttribute('style')).toContain(token);
  });

  it('says under the clock which sky is overhead', async () => {
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.clock .d')).toBeTruthy());
    const { campusSky } = await import('../../src/lib/campusTime.js');
    expect(container.querySelector('.clock .d').textContent).toContain(`${campusSky(new Date()).sky} over Urbana`);
  });
});

/**
 * Two things the document does before anything has loaded.
 *
 * The three faces are named in the stylesheet, so the browser only learns they
 * exist once it has fetched and parsed a stylesheet that is itself holding the
 * first paint. Asking for the two the page is set in up front takes a round
 * trip out of the path to readable text, and out of the reflow that lands when
 * a face swaps in under text already painted in the fallback.
 *
 * The page body is also given a height to start at. Without one, the body is
 * nothing tall until the feed arrives, and everything under it moves down the
 * moment it does, which is what the layout shift on the front page was.
 */
describe('the document the server sends', () => {
  const shell = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

  it.each([
    'BricolageGrotesque-latin.woff2',
    'IBMPlexSans-latin.woff2',
  ])('asks for %s before the stylesheet names it', file => {
    const preload = new RegExp(`<link[^>]+rel="preload"[^>]*${file}[^>]*>`);
    const tag = preload.exec(shell)?.[0] ?? '';
    expect(tag, `expected a preload for ${file}`).not.toBe('');
    expect(tag).toContain('as="font"');
    // A font is fetched anonymously whatever the page says, so a preload that
    // does not say so fetches it a second time.
    expect(tag).toContain('crossorigin');
  });

  it('asks for nothing it does not use on the first screen', () => {
    const preloads = shell.match(/rel="preload"[^>]*as="font"/g) ?? [];
    expect(preloads.length).toBeLessThanOrEqual(2);
  });
});

/**
 * The page body starts tall enough that the footer does not jump.
 *
 * Every page begins with nothing in it and fills once the feed, the event or
 * the organization arrives. With no height of its own, the body is nothing
 * tall at first paint and the footer sits directly under the band, so
 * everything below the fold moves the moment the content lands. That was the
 * whole of the layout shift on the inner pages, which measured well into what
 * Core Web Vitals calls poor.
 */
describe('how much the page moves while it loads', () => {
  it('holds a height for the body before anything is in it', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.svelte'), 'utf8');
    const body = /\.page-body\s*\{([^}]*)\}/.exec(source)?.[1] ?? '';
    expect(body, 'expected a .page-body rule').not.toBe('');
    expect(body).toMatch(/min-height:/);
  });
});
