import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';

const getMe = vi.hoisted(() => vi.fn());
const getEvents = vi.hoisted(() => vi.fn());
const path = vi.hoisted(() => ({ store: null }));

vi.mock('../src/api/users.js', () => ({ getMe }));
vi.mock('../src/api/events.js', () => ({ getEvents, createEvent: vi.fn(), createEventSeries: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock('../src/api/rsos.js', () => ({
  getRsos: vi.fn().mockResolvedValue({ rsos: [] }),
  getRso: vi.fn().mockResolvedValue({ rso: { rso_id: 1, name: 'IEEE', members: [], events: [] } }),
  updateRso: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(),
  getRsoStats: vi.fn().mockResolvedValue({ stats: {} }),
}));
vi.mock('../src/api/semester.js', () => ({ getCurrentSemester: vi.fn().mockResolvedValue({ semester: {} }) }));
vi.mock('../src/lib/CircuitBackground.svelte', async () => ({
  default: (await import('./stubs/Empty.svelte')).default,
}));
const navigate = vi.hoisted(() => vi.fn());
const matchRoute = vi.hoisted(() => vi.fn().mockReturnValue(null));
vi.mock('../src/lib/router.js', async () => {
  const { writable } = await import('svelte/store');
  path.store = writable('/');
  return { currentPath: path.store, navigate, matchRoute };
});

const App = (await import('../src/App.svelte')).default;

const EVENT = {
  event_id: 1, title: 'PCB Design Workshop', description: 'Lay out a board.',
  start_time: '2026-10-01 18:00:00', end_time: '2026-10-01 20:00:00',
  rso_name: 'HKN', is_private: 0, tags: 'Workshop',
};

beforeEach(() => {
  vi.clearAllMocks();
  path.store.set('/');
  matchRoute.mockReturnValue(null);
  window.localStorage.clear();
  getEvents.mockResolvedValue({ events: [EVENT], total: 1 });
});

/**
 * Every visit used to wait on the answer to "who is this" before drawing
 * anything at all, so a student opening the feed watched a skeleton until a
 * round trip they have no interest in came back.
 */
describe('App, before it knows who is looking', () => {
  it('draws the feed without waiting to find out', async () => {
    getMe.mockReturnValue(new Promise(() => {}));   // never answers
    const { findByRole } = render(App);
    expect(await findByRole('heading', { name: 'Upcoming Events' })).toBeTruthy();
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
  });

  /**
   * A page that only exists for a signed in board member is a different
   * matter: drawing it before the answer arrives would send them to the login
   * page they are already past.
   */
  it('waits on a page that only a signed in person can use', async () => {
    getMe.mockReturnValue(new Promise(() => {}));
    path.store.set('/dashboard');
    const { container, queryByRole } = render(App);
    expect(queryByRole('heading', { name: 'Upcoming Events' })).toBeNull();
    expect(container.querySelector('.shimmer, .animate-pulse')).toBeTruthy();
  });

  it('draws the page once the answer arrives', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', memberships: [{ rso_id: 1, role: 'Board' }] } });
    path.store.set('/dashboard');
    const { container, findByText } = render(App);
    expect(await findByText('jdoe2')).toBeTruthy();
    await waitFor(() => expect(container.querySelector('.animate-pulse')).toBeNull());
  });
});

/**
 * Signing in through the university's identity provider is a round trip that
 * ends at the front page, so somebody who followed the Discord link address
 * while signed out has to be put back on it once they are known.
 */
describe('App, once it knows who is looking', () => {
  it('sends the person on to the address they were headed for', async () => {
    window.localStorage.setItem('via_after_sign_in', '/link/discord/abc');
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', memberships: [] } });
    render(App);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/link/discord/abc'));
    expect(window.localStorage.getItem('via_after_sign_in')).toBeNull();
  });

  it('goes nowhere when nobody was headed anywhere', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', memberships: [] } });
    render(App);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes nowhere when nobody signed in', async () => {
    window.localStorage.setItem('via_after_sign_in', '/link/discord/abc');
    getMe.mockRejectedValue(new Error('Authentication required'));
    render(App);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('draws the account page', async () => {
    getMe.mockResolvedValue({
      user: { net_id: 'jdoe2', memberships: [], discord: { linked: false, linked_at: null } },
    });
    path.store.set('/account');
    const { findByRole } = render(App);
    expect(await findByRole('heading', { name: 'Your account' })).toBeTruthy();
  });

  it('draws the Discord link page for a link address', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', memberships: [] } });
    matchRoute.mockReturnValue({ name: 'link-discord', params: { session: 'abc' } });
    path.store.set('/link/discord/abc');
    const { findByRole } = render(App);
    expect(await findByRole('heading', { name: 'Link your Discord account' })).toBeTruthy();
  });

  it('draws the page that confirms a link was made', async () => {
    getMe.mockResolvedValue({ user: { net_id: 'jdoe2', memberships: [] } });
    matchRoute.mockReturnValue({ name: 'link-discord-done', params: { session: 'abc' } });
    path.store.set('/link/discord/abc/done');
    const { findByRole } = render(App);
    expect(await findByRole('heading', { name: 'Your Discord account is linked' })).toBeTruthy();
  });
});
