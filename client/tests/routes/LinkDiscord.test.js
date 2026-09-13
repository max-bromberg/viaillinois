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

/**
 * The two stores the page reads, as stores rather than as fixed values, so a
 * test can do what the application does: draw the page before the account has
 * been read, then answer.
 */
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
vi.mock('../../src/stores/auth.js', () => auth);

const SESSION = 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT';
const LinkDiscord = (await import('../../src/routes/LinkDiscord.svelte')).default;

const show = (props = {}) => render(LinkDiscord, { session: SESSION, ...props });

beforeEach(() => {
  vi.clearAllMocks();
  auth.currentUser.set({ net_id: 'rgarcia7', memberships: [] });
  auth.authResolved.set(true);
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
    auth.currentUser.set(null);
    show();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    expect(JSON.parse(window.localStorage.getItem('via_after_sign_in')).path)
      .toBe(`/link/discord/${SESSION}`);
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

  /**
   * The optional step is a preference, so it is a switch, which says whether it
   * is on in where its pad sits as well as in what it reports.
   */
  it('leaves the optional linked roles step on, and lets it be turned off', async () => {
    show();
    const box = await screen.findByLabelText(/roles/i);
    expect(box.getAttribute('role')).toBe('switch');
    expect(box.getAttribute('aria-checked')).toBe('true');
    await fireEvent.click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
    const button = await screen.findByRole('link', { name: /continue to discord/i });
    expect(button.getAttribute('href')).toBe(`/auth/discord/start?session=${SESSION}&roles=0`);
  });

  it('turns the switch with the keyboard as well as with the pointer', async () => {
    show();
    const box = await screen.findByLabelText(/roles/i);
    await fireEvent.keyDown(box, { key: ' ' });
    expect(box.getAttribute('aria-checked')).toBe('false');
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

  /**
   * Whether somebody is signed in is the answer to a request of its own, and
   * the page is drawn before that answer arrives. Reading it once, on mount,
   * meant a signed in person who opened the address was sent to sign in again
   * whenever their account had not been read yet.
   */
  it('waits for the account to be read before deciding anybody is signed out', async () => {
    auth.authResolved.set(false);
    auth.currentUser.set(null);
    show();

    expect(navigate).not.toHaveBeenCalled();
    expect(getLinkSession).not.toHaveBeenCalled();

    auth.currentUser.set({ net_id: 'rgarcia7', memberships: [] });
    auth.authResolved.set(true);

    await screen.findByRole('link', { name: /continue to discord/i });
    expect(navigate).not.toHaveBeenCalled();
    expect(getLinkSession).toHaveBeenCalledWith(SESSION);
  });

  it('sends the person to sign in once the account has been read and there is nobody', async () => {
    auth.authResolved.set(false);
    auth.currentUser.set(null);
    show();
    expect(navigate).not.toHaveBeenCalled();

    auth.authResolved.set(true);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
    expect(JSON.parse(window.localStorage.getItem('via_after_sign_in')).path)
      .toBe(`/link/discord/${SESSION}`);
  });

  /**
   * VIA serves one campus, so every time it shows is that campus's time. Read
   * in the browser's own zone, the expiry on this page told a student reading
   * it from another zone an hour that was not the hour it runs out at.
   */
  it('shows the expiry on the campus clock, whatever zone the reader is in', async () => {
    getLinkSession.mockResolvedValue({ status: 'open', expires_at: '2026-09-04T18:40:00-05:00' });
    show();
    await screen.findByRole('link', { name: /continue to discord/i });
    expect(document.body.textContent).toMatch(/6:40 PM/);
  });

  it('says when the sign in lapsed while the person was on Discord', async () => {
    window.history.replaceState({}, '', `/link/discord/${SESSION}?reason=signedout`);
    show();
    await waitFor(() => expect(document.body.textContent).toMatch(/signed out/i));
  });

  it('says when the person cancelled on Discord, and offers the button again', async () => {
    window.history.replaceState({}, '', `/link/discord/${SESSION}?reason=declined`);
    show();
    await screen.findByRole('link', { name: /continue to discord/i });
    expect(document.body.textContent).toMatch(/did not finish/i);
  });

  /**
   * A refusal on the way back from Discord is a sentence with a pad beside it,
   * not a coloured box. See the review checklist in
   * docs/design/11-implementation.md.
   */
  it('says a refusal in a sentence rather than in a box', async () => {
    window.history.replaceState({}, '', `/link/discord/${SESSION}?reason=expired`);
    getLinkSession.mockResolvedValue({ status: 'expired' });
    const { container } = show();
    await waitFor(() => expect(container.textContent).toMatch(/could not be read|has expired/i));
    const said = container.querySelector('.said');
    expect(said.querySelector('.pad')).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/border-amber|rounded-md|bg-card/);
  });

  /** One primary button on a screen, and it is the one that goes to Discord. */
  it('offers one primary button', async () => {
    const { container } = show();
    await screen.findByRole('link', { name: /continue to discord/i });
    const primary = [...container.querySelectorAll('.btn.primary')];
    expect(primary.length).toBe(1);
    expect(primary[0].textContent).toMatch(/continue to discord/i);
  });

  it('sets the page title as the one first level heading', async () => {
    const { getByRole } = show();
    expect(getByRole('heading', { name: 'Link your Discord account', level: 1 })).toBeTruthy();
  });
});
