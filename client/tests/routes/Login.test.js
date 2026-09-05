import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { rememberAfterSignIn } from '../../src/lib/afterSignIn.js';

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/base.js', () => ({ apiFetch }));

const getMe = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/users.js', () => ({ getMe, unlinkDiscord: vi.fn() }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/router.js', () => ({
  navigate,
  currentPath: { subscribe: fn => { fn('/login'); return () => {}; } },
}));

vi.mock('../../src/stores/ui.js', () => ({ showToast: vi.fn() }));
vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: fn => { fn(null); return () => {}; }, set: vi.fn() },
}));

const Login = (await import('../../src/routes/Login.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  apiFetch.mockResolvedValue({ net_id: 'jdoe2' });
  getMe.mockResolvedValue({ user: { net_id: 'jdoe2', memberships: [] } });
});

async function signInWithAPassword() {
  await fireEvent.click(screen.getByText(/password login/i));
  await fireEvent.input(screen.getByLabelText(/username/i), { target: { value: 'jdoe2' } });
  await fireEvent.input(screen.getByLabelText(/password/i), { target: { value: 'a-password' } });
  await fireEvent.submit(screen.getByRole('button', { name: /^sign in$/i }).closest('form'));
}

/**
 * Somebody who followed the Discord link address while signed out is sent here
 * and has to end up back on it, whichever way they signed in.
 */
describe('the login page', () => {
  it('goes on to the address the person was headed for', async () => {
    rememberAfterSignIn('/link/discord/abc');
    render(Login);
    await signInWithAPassword();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/link/discord/abc'));
    expect(window.localStorage.getItem('via_after_sign_in')).toBeNull();
  });

  it('goes to the feed when nobody was headed anywhere', async () => {
    render(Login);
    await signInWithAPassword();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
  });
});
