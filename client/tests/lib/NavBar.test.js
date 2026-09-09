import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { currentUser, authResolved } from '../../src/stores/auth.js';
import NavBar from '../../src/lib/NavBar.svelte';

vi.mock('../../src/api/users.js', () => ({ logout: vi.fn() }));
vi.mock('../../src/lib/router.js', async () => {
  const { writable } = await import('svelte/store');
  return { currentPath: writable('/'), navigate: vi.fn() };
});

beforeEach(() => {
  currentUser.set(null);
  authResolved.set(false);
});

/**
 * currentUser is null both before the answer to who is looking arrives and
 * when the answer is nobody. Treating those as the same thing put Sign in on
 * screen for a moment on every page a signed in board member opened.
 */
describe('NavBar, before it knows who is looking', () => {
  it('offers nothing about an account until it knows', () => {
    const { queryByRole } = render(NavBar);
    expect(queryByRole('button', { name: 'Sign in' })).toBeNull();
    expect(queryByRole('button', { name: 'Sign out' })).toBeNull();
  });

  it('offers to sign in once it knows nobody is', async () => {
    const { findByRole } = render(NavBar);
    authResolved.set(true);
    expect(await findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('names the reader once it knows who they are', async () => {
    const { findByText, queryByRole } = render(NavBar);
    currentUser.set({ net_id: 'jdoe2', memberships: [] });
    authResolved.set(true);
    expect(await findByText('jdoe2')).toBeTruthy();
    expect(queryByRole('button', { name: 'Sign in' })).toBeNull();
  });
});

/**
 * The board's own entries.
 *
 * The dashboard and the admin page are for the people who run an organization
 * rather than for a student reading the feed, and the navigation ran them
 * together with About and Updates as though they were the same kind of thing.
 * The dashboard is also now named for what it holds.
 */
describe('NavBar, the board entries', () => {
  it('names the dashboard for the organizations it holds', async () => {
    const { findByRole, queryByRole } = render(NavBar);
    currentUser.set({ net_id: 'jdoe2', memberships: [{ rso_id: 1, role: 'Board' }] });
    authResolved.set(true);
    expect(await findByRole('link', { name: 'My RSOs' })).toBeTruthy();
    expect(queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

  it('separates them from the entries every reader has', async () => {
    const { container } = render(NavBar);
    currentUser.set({ net_id: 'jdoe2', memberships: [{ rso_id: 1, role: 'Board' }] });
    authResolved.set(true);
    await waitFor(() => expect(container.querySelector('[data-board-divider]')).not.toBeNull());
  });

  it('shows no separator to a reader who runs nothing', async () => {
    const { container } = render(NavBar);
    currentUser.set(null);
    authResolved.set(true);
    await waitFor(() => expect(container.querySelector('[data-board-divider]')).toBeNull());
  });
});

/**
 * Updates had an entry of their own beside About, which put two entries in the
 * navigation for one thing a reader looks at rarely. They are part of About now.
 */
describe('NavBar, the reader entries', () => {
  it('offers About, which is where the updates are', async () => {
    const { findByRole } = render(NavBar);
    authResolved.set(true);
    expect(await findByRole('link', { name: 'About' })).toBeTruthy();
  });

  it('no longer offers Updates on its own', async () => {
    const { queryAllByRole } = render(NavBar);
    authResolved.set(true);
    await waitFor(() => expect(queryAllByRole('link', { name: 'Updates' })).toEqual([]));
  });
});
