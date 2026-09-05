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

const setUser = vi.hoisted(() => vi.fn());
/** The two stores the page reads, so a test can answer them when it chooses. */
const auth = vi.hoisted(() => {
  const make = initial => {
    let value = initial;
    const listeners = new Set();
    return {
      subscribe(run) { listeners.add(run); run(value); return () => listeners.delete(run); },
      set(next) { value = next; for (const run of listeners) run(value); },
    };
  };
  return { currentUser: make(null), authResolved: make(false) };
});
vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: auth.currentUser.subscribe, set: setUser },
  authResolved: auth.authResolved,
}));

let user = {
  net_id: 'rgarcia7', full_name: 'Rosa Garcia', is_global_admin: false, memberships: [],
  discord: { linked: true, linked_at: '2026-09-04T18:32:11-05:00', roles_published: false },
};

const Account = (await import('../../src/routes/Account.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  user = {
    net_id: 'rgarcia7', full_name: 'Rosa Garcia', is_global_admin: false, memberships: [],
    discord: { linked: true, linked_at: '2026-09-04T18:32:11-05:00', roles_published: false },
  };
  window.history.replaceState({}, '', '/account');
  auth.currentUser.set(user);
  auth.authResolved.set(true);
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

  /**
   * The day a link was made is a day on campus, not a day in whatever zone the
   * reader happens to be in when they open the page.
   */
  it('shows the day the link was made on the campus clock', async () => {
    auth.currentUser.set({
      ...user,
      // Late in the evening on campus, which is already the next day in UTC
      // and everywhere east of it.
      discord: { linked: true, linked_at: '2026-09-04T23:30:00-05:00', roles_published: false },
    });
    render(Account);
    expect(document.body.textContent).toMatch(/September 4, 2026/);
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
    auth.currentUser.set({ ...user, discord: { linked: false, linked_at: null } });
    render(Account);
    expect(document.body.textContent).toMatch(/\/link/);
    expect(screen.queryByRole('button', { name: /unlink/i })).toBeNull();
  });

  /**
   * The account page is about one person's account, so there is nothing on it
   * for somebody who is not signed in. It sends them to sign in, as the
   * dashboard does, rather than drawing a page with nobody's name on it.
   */
  it('sends a signed out visitor to sign in', async () => {
    auth.currentUser.set(null);
    render(Account);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });

  it('waits for the account to be read before deciding anybody is signed out', async () => {
    auth.authResolved.set(false);
    auth.currentUser.set(null);
    render(Account);
    expect(navigate).not.toHaveBeenCalled();

    auth.authResolved.set(true);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });

  /**
   * The linked roles step is optional when a person links, and this is where
   * they take it afterwards. It publishes three facts to Discord and nothing
   * else, so the page says which three before it offers the button.
   */
  it('offers the linked roles step when the link does not carry it, and says what it publishes', async () => {
    render(Account);
    const button = await screen.findByRole('link', { name: /linked roles/i });
    expect(button.getAttribute('href')).toBe('/auth/discord/start?roles=1');
    expect(document.body.textContent).toMatch(/verified/i);
    expect(document.body.textContent).toMatch(/board/i);
    expect(document.body.textContent).toMatch(/the day you linked/i);
  });

  it('says the step is already taken rather than offering it again', async () => {
    auth.currentUser.set({
      ...user,
      discord: { linked: true, linked_at: '2026-09-04T18:32:11-05:00', roles_published: true },
    });
    render(Account);
    expect(document.body.textContent).toMatch(/already publishes/i);
    expect(screen.queryByRole('link', { name: /linked roles/i })).toBeNull();
  });

  it('does not offer the step to somebody with no Discord account linked', async () => {
    auth.currentUser.set({
      ...user, discord: { linked: false, linked_at: null, roles_published: false },
    });
    render(Account);
    expect(screen.queryByRole('link', { name: /linked roles/i })).toBeNull();
  });

  it('says what happened when the person comes back from Discord', async () => {
    window.history.replaceState({}, '', '/account?roles=on');
    render(Account);
    await waitFor(() => expect(document.body.textContent).toMatch(/Discord now has/i));
  });

  it('says when the sign in lapsed while the person was on Discord', async () => {
    window.history.replaceState({}, '', '/account?roles=signedout');
    render(Account);
    await waitFor(() => expect(document.body.textContent).toMatch(/signed out/i));
  });

  it('says what happened when the person did not finish on Discord', async () => {
    window.history.replaceState({}, '', '/account?roles=declined');
    render(Account);
    await waitFor(() => expect(document.body.textContent).toMatch(/did not finish/i));
  });
});
