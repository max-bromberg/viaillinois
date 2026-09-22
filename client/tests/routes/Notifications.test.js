import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';

const getDiscordEntry = vi.hoisted(() => vi.fn());
const currentUser = vi.hoisted(() => {
  // eslint-disable-next-line no-undef
  return { value: null };
});

vi.mock('../../src/api/discord.js', () => ({ getDiscordEntry }));
vi.mock('../../src/lib/router.js', () => ({
  navigate: vi.fn(),
  currentPath: { subscribe: fn => { fn('/notifications'); return () => {}; } },
}));

const user = writable(null);
vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: fn => user.subscribe(fn), set: v => user.set(v) },
  adminRsoIds: { subscribe: fn => { fn([]); return () => {}; } },
  boardRsoIds: { subscribe: fn => { fn([]); return () => {}; } },
}));

const Notifications = (await import('../../src/routes/Notifications.svelte')).default;

const PERSONAL = 'https://discord.com/oauth2/authorize?client_id=1055&integration_type=1&scope=applications.commands';
const SERVER = 'https://discord.com/oauth2/authorize?client_id=1055&scope=bot+applications.commands';

beforeEach(() => {
  vi.clearAllMocks();
  user.set(null);
  getDiscordEntry.mockResolvedValue({
    configured: true, personal_install_url: PERSONAL, server_install_url: SERVER,
  });
});

/**
 * The page for a student who would come to things if they heard about them.
 *
 * Every other way into VIA assumes somebody already thought to open it, and
 * most people do not open a website to find out whether anything is on. This
 * page is about hearing rather than looking, so it leads with what a person
 * gets and offers the one action that starts it, which is adding VIA to their
 * own Discord account. No server, no club, and nobody's permission.
 */
describe('the page about hearing when events happen', () => {
  it('leads with hearing about events rather than with the software', async () => {
    const { findByRole } = render(Notifications);
    const heading = await findByRole('heading', { level: 1 });
    expect(heading.textContent.toLowerCase()).toMatch(/event/);
  });

  it('offers adding VIA to a person\'s own Discord account', async () => {
    const { findByRole } = render(Notifications);
    const add = await findByRole('link', { name: /add via to discord/i });

    expect(add.getAttribute('href')).toBe(PERSONAL);
    expect(add.getAttribute('rel')).toContain('noopener');
  });

  /**
   * A personal install needs no server, which is the thing most people assume
   * they need and the reason they do not bother. The page says so.
   */
  it('says that no server of their own is needed', async () => {
    const { container } = render(Notifications);
    await waitFor(() => expect(getDiscordEntry).toHaveBeenCalled());
    expect(container.textContent.toLowerCase()).toMatch(/no server|without a server|own account/);
  });

  /** A board reading this page is also told how to put it in their server. */
  it('offers the server install as well, for somebody who runs one', async () => {
    const { findByRole } = render(Notifications);
    const add = await findByRole('link', { name: /add via to a discord server/i });
    expect(add.getAttribute('href')).toBe(SERVER);
  });

  it('tells somebody who has already linked their account that they have', async () => {
    user.set({ net_id: 'rgarcia7', discord: { linked: true } });
    const { container } = render(Notifications);
    await waitFor(() => expect(getDiscordEntry).toHaveBeenCalled());
    expect(container.textContent.toLowerCase()).toMatch(/already linked|your discord account is linked/);
  });

  /**
   * A deployment with no Discord application configured has nothing to offer,
   * and an address built from a missing identifier leads nowhere. The page
   * says what the bot does and leaves the button out.
   */
  it('leaves the offer out where no Discord application is configured', async () => {
    getDiscordEntry.mockResolvedValue({
      configured: false, personal_install_url: null, server_install_url: null,
    });
    const { queryByRole, findByRole } = render(Notifications);

    await findByRole('heading', { level: 1 });
    await waitFor(() => expect(getDiscordEntry).toHaveBeenCalled());
    expect(queryByRole('link', { name: /add via to discord/i })).toBe(null);
  });

  /** A page that could not ask still reads as a page rather than as an error. */
  it('still explains itself when the addresses could not be read', async () => {
    getDiscordEntry.mockRejectedValue(new Error('VIA did not answer.'));
    const { findByRole } = render(Notifications);
    expect(await findByRole('heading', { level: 1 })).toBeTruthy();
  });
});
