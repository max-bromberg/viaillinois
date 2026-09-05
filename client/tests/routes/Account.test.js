import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

const getMe = vi.hoisted(() => vi.fn());
const unlinkDiscord = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/users.js', () => ({ getMe, unlinkDiscord }));

const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../src/stores/ui.js', () => ({ showToast }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/router.js', () => ({
  navigate,
  currentPath: { subscribe: fn => { fn('/account'); return () => {}; } },
  routeParams: { subscribe: fn => { fn({}); return () => {}; } },
  matchRoute: () => null,
}));

let user = {
  net_id: 'rgarcia7', full_name: 'Rosa Garcia', is_global_admin: false, memberships: [],
  discord: { linked: true, linked_at: '2026-09-04T18:32:11-05:00' },
};
const setUser = vi.hoisted(() => vi.fn());
vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: fn => { fn(user); return () => {}; }, set: setUser },
  authResolved: { subscribe: fn => { fn(true); return () => {}; } },
}));

const Account = (await import('../../src/routes/Account.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  user = {
    net_id: 'rgarcia7', full_name: 'Rosa Garcia', is_global_admin: false, memberships: [],
    discord: { linked: true, linked_at: '2026-09-04T18:32:11-05:00' },
  };
  unlinkDiscord.mockResolvedValue({ ok: true });
  getMe.mockResolvedValue({ user: { ...user, discord: { linked: false, linked_at: null } } });
});

/**
 * The account page, which exists so that a person can see and undo the one
 * thing about their account that was set up somewhere else.
 */
describe('the account page', () => {
  it('says a Discord account is linked, and when', async () => {
    render(Account);
    expect(document.body.textContent).toMatch(/Discord/);
    expect(document.body.textContent).toMatch(/linked/i);
    await screen.findByRole('button', { name: /unlink/i });
  });

  it('asks before it unlinks, and does nothing if the answer is no', async () => {
    render(Account);
    await fireEvent.click(await screen.findByRole('button', { name: /unlink/i }));
    expect(unlinkDiscord).not.toHaveBeenCalled();
    await fireEvent.click(await screen.findByRole('button', { name: /^no,/i }));
    expect(unlinkDiscord).not.toHaveBeenCalled();
  });

  it('unlinks once the person confirms, and reads the account back', async () => {
    render(Account);
    await fireEvent.click(await screen.findByRole('button', { name: /unlink/i }));
    await fireEvent.click(await screen.findByRole('button', { name: /^yes,/i }));
    await waitFor(() => expect(unlinkDiscord).toHaveBeenCalledTimes(1));
    expect(getMe).toHaveBeenCalled();
    expect(setUser).toHaveBeenCalled();
  });

  it('says so when the unlink fails, and leaves the state alone', async () => {
    unlinkDiscord.mockRejectedValue(new Error('VIA is busy right now.'));
    render(Account);
    await fireEvent.click(await screen.findByRole('button', { name: /unlink/i }));
    await fireEvent.click(await screen.findByRole('button', { name: /^yes,/i }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('VIA is busy right now.', 'error'));
  });

  it('explains how to link when no Discord account is linked', async () => {
    user = { ...user, discord: { linked: false, linked_at: null } };
    render(Account);
    expect(document.body.textContent).toMatch(/\/link/);
    expect(screen.queryByRole('button', { name: /unlink/i })).toBeNull();
  });
});
