import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

const getMe = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/users.js', () => ({ getMe }));
vi.mock('../../src/api/events.js', () => ({ getEvents: vi.fn().mockResolvedValue({ events: [], total: 0 }) }));
vi.mock('../../src/api/midterms.js', () => ({ getConfirmedMidterms: vi.fn().mockResolvedValue({ midterms: [] }) }));
vi.mock('../../src/lib/CircuitBackground.svelte', async () => ({
  default: (await import('../stubs/Empty.svelte')).default,
}));

const App = (await import('../../src/App.svelte')).default;
const { currentPath } = await import('../../src/lib/router.js');
const { currentUser } = await import('../../src/stores/auth.js');

/**
 * A reading page puts its title in the sky band, in place of the greeting.
 *
 * docs/design/08-surfaces.md asks for it, and the page and the band each knew
 * half of what was needed: the band takes a title and the page knows what it is.
 * A store carries it between them rather than every reading page being wired
 * through the router.
 */
beforeEach(() => {
  getMe.mockReset();
  getMe.mockRejectedValue(new Error('not signed in'));
  currentUser.set(null);
  currentPath.set('/');
});

describe('the page title', () => {
  it('is the band on a reading page, and the page draws no second one', async () => {
    currentPath.set('/privacy');
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.greet h1')).toBeTruthy());
    expect(container.querySelector('.greet h1').textContent).toBeTruthy();
    // One first level heading on the page, and it is the one in the band.
    expect(container.querySelectorAll('h1').length).toBe(1);
    expect(container.querySelector('h1').closest('.skyband')).toBeTruthy();
  });

  it('leaves the greeting alone on the feed', async () => {
    currentPath.set('/');
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.greet h2')).toBeTruthy());
    expect(container.querySelector('.greet h2').textContent).toContain('Illinois.');
  });

  /**
   * One primary button per screen. The band offers signing in from every page,
   * and on the login page that was a second primary beside the one the page is
   * for.
   */
  it('does not offer a way in from the page that is the way in', async () => {
    currentPath.set('/login');
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.skyband')).toBeTruthy());
    const inBand = container.querySelector('.skyband .nav .right');
    expect(inBand.textContent).not.toContain('Sign in');
  });

  it('offers the way in from everywhere else', async () => {
    currentPath.set('/about');
    const { container } = render(App);
    await waitFor(() => expect(container.querySelector('.skyband .nav .right')).toBeTruthy());
    expect(container.querySelector('.skyband .nav .right').textContent).toContain('Sign in');
  });
});
