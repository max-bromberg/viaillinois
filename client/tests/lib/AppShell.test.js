import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    expect(going).toEqual(['/', '/calendar', '/midterms', '/about']);
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
    expect(container.querySelector('.clock .d').textContent).toContain(`${campusSky(new Date()).sky} over ECEB`);
  });
});
