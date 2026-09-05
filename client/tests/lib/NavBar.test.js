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
 * The account area used to be the reader's NetID and nothing else. It is now
 * the way to the account page, which is where the Discord link is seen and
 * undone.
 */
describe('NavBar, the account area', () => {
  it('makes the name of the person signed in the way to their account page', async () => {
    const { findByRole } = render(NavBar);
    currentUser.set({ net_id: 'jdoe2', memberships: [] });
    authResolved.set(true);
    const link = await findByRole('link', { name: 'jdoe2' });
    expect(link.getAttribute('href')).toBe('/account');
  });
});
