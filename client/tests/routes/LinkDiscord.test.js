import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

const getLinkSession = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/link.js', () => ({ getLinkSession }));

const navigate = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/router.js', () => ({
  navigate,
  currentPath: { subscribe: fn => { fn('/link/discord/abc'); return () => {}; } },
  routeParams: { subscribe: fn => { fn({}); return () => {}; } },
  matchRoute: () => null,
}));

let user = { net_id: 'rgarcia7', memberships: [] };
vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: fn => { fn(user); return () => {}; }, set: vi.fn() },
  authResolved: { subscribe: fn => { fn(true); return () => {}; } },
}));

const SESSION = 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT';
const LinkDiscord = (await import('../../src/routes/LinkDiscord.svelte')).default;

const show = (props = {}) => render(LinkDiscord, { session: SESSION, ...props });

beforeEach(() => {
  vi.clearAllMocks();
  user = { net_id: 'rgarcia7', memberships: [] };
  window.localStorage.clear();
  window.history.replaceState({}, '', `/link/discord/${SESSION}`);
  getLinkSession.mockResolvedValue({ status: 'open', expires_at: '2026-09-04T18:40:00-05:00' });
});

/**
 * The page a person lands on from a direct message the bot sent them.
 *
 * It has one job, which is to let somebody say yes with their eyes open: what
 * the bot will be able to do as them, what it will never do, and that they can
 * undo it whenever they want.
 */
describe('the Discord link page', () => {
  it('sends somebody who is not signed in to sign in, and remembers where to come back to', async () => {
    user = null;
    show();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    expect(window.localStorage.getItem('via_after_sign_in')).toBe(`/link/discord/${SESSION}`);
    expect(getLinkSession).not.toHaveBeenCalled();
  });

  it('explains what linking does and what it does not do', async () => {
    show();
    await screen.findByRole('link', { name: /continue to discord/i });
    expect(document.body.textContent).toMatch(/never reads your messages/i);
    expect(document.body.textContent).toMatch(/undo/i);
  });

  it('offers one button that starts the Discord authorization', async () => {
    show();
    const button = await screen.findByRole('link', { name: /continue to discord/i });
    expect(button.getAttribute('href')).toBe(`/auth/discord/start?session=${SESSION}&roles=1`);
  });

  it('leaves the optional linked roles step ticked, and lets it be unticked', async () => {
    show();
    const box = await screen.findByLabelText(/roles/i);
    expect(box.checked).toBe(true);
    await fireEvent.click(box);
    const button = await screen.findByRole('link', { name: /continue to discord/i });
    expect(button.getAttribute('href')).toBe(`/auth/discord/start?session=${SESSION}&roles=0`);
  });

  it('says an expired request has expired and to run the command again', async () => {
    getLinkSession.mockResolvedValue({ status: 'expired' });
    show();
    await waitFor(() => expect(document.body.textContent).toMatch(/expired/i));
    expect(document.body.textContent).toMatch(/run the link command on Discord again/i);
    expect(screen.queryByRole('link', { name: /continue to discord/i })).toBeNull();
  });

  it('says an unknown request is not one it opened', async () => {
    getLinkSession.mockResolvedValue({ status: 'unknown' });
    show();
    await waitFor(() => expect(document.body.textContent).toMatch(/run the link command on Discord again/i));
    expect(screen.queryByRole('link', { name: /continue to discord/i })).toBeNull();
  });

  it('says a completed request is already done', async () => {
    getLinkSession.mockResolvedValue({ status: 'completed' });
    show();
    await waitFor(() => expect(document.body.textContent).toMatch(/already/i));
  });

  it('says when the Discord account that authorized was a different one', async () => {
    window.history.replaceState({}, '', `/link/discord/${SESSION}?reason=mismatch`);
    show();
    await waitFor(() => expect(document.body.textContent).toMatch(/different Discord account/i));
  });

  it('says when the person cancelled on Discord, and offers the button again', async () => {
    window.history.replaceState({}, '', `/link/discord/${SESSION}?reason=declined`);
    show();
    await screen.findByRole('link', { name: /continue to discord/i });
    expect(document.body.textContent).toMatch(/did not finish/i);
  });
});
