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

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../src/stores/ui.js', async importOriginal => ({ ...await importOriginal(), showToast }));
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
  await fireEvent.click(screen.getByText(/VIA password/i));
  await fireEvent.input(await screen.findByLabelText(/username/i), { target: { value: 'jdoe2' } });
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

  it('says what went wrong rather than failing quietly', async () => {
    apiFetch.mockRejectedValue(new Error('That username and password do not match.'));
    render(Login);
    await signInWithAPassword();
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('That username and password do not match.', 'error'));
  });

  /**
   * docs/design/08-surfaces.md: one primary button for the NetID sign in and a
   * quiet button for the local fallback.
   */
  it('offers one primary button, which is the NetID sign in', () => {
    const { container } = render(Login);
    const primary = [...container.querySelectorAll('.btn.primary')];
    expect(primary.length).toBe(1);
    expect(primary[0].textContent).toMatch(/NetID/);
  });

  it('offers the password sign in quietly, and keeps it shut until it is asked for', async () => {
    const { container } = render(Login);
    const quiet = container.querySelector('.btn.quiet');
    expect(quiet.textContent).toMatch(/VIA password/i);
    expect(quiet.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText(/username/i)).toBeNull();

    await fireEvent.click(quiet);
    expect(await screen.findByLabelText(/username/i)).toBeTruthy();
    expect(quiet.getAttribute('aria-expanded')).toBe('true');
  });

  it('draws the mark rather than loading it as an image', () => {
    const { container } = render(Login);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg.mark')).toBeTruthy();
  });

  it('names the page for whoever is reading it', () => {
    const { getByRole } = render(Login);
    expect(getByRole('heading', { name: 'Sign in', level: 1 })).toBeTruthy();
  });

  it('stops answering while it is signing somebody in', async () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = render(Login);
    await fireEvent.click(screen.getByText(/VIA password/i));
    await fireEvent.input(await screen.findByLabelText(/username/i), { target: { value: 'jdoe2' } });
    await fireEvent.input(screen.getByLabelText(/password/i), { target: { value: 'a-password' } });
    await fireEvent.submit(screen.getByRole('button', { name: /^sign in$/i }).closest('form'));
    await waitFor(() => {
      const submit = container.querySelector('form .btn');
      expect(submit.getAttribute('aria-busy')).toBe('true');
    });
  });
});
