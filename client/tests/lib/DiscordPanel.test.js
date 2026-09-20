import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getRsoDiscord = vi.hoisted(() => vi.fn());
const unbindRsoDiscord = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/rsoDiscord.js', () => ({ getRsoDiscord, unbindRsoDiscord }));
vi.mock('../../src/stores/ui.js', async importOriginal => ({
  ...await importOriginal(), showToast,
}));

const DiscordPanel = (await import('../../src/lib/DiscordPanel.svelte')).default;

const INSTALL = 'https://discord.com/oauth2/authorize?client_id=1055&scope=bot+applications.commands';

const CONNECTED = {
  guilds: [{
    guild_id: '204255221017214977',
    guild_name: 'IEEE at Illinois',
    bound_by: '1055',
    bound_at: '2026-09-01 12:00:00',
  }],
  install_url: INSTALL,
};

beforeEach(() => {
  vi.clearAllMocks();
  getRsoDiscord.mockResolvedValue({ guilds: [], install_url: INSTALL });
});

/**
 * What a board reads about its own Discord server.
 *
 * The binding belongs to the bot and the website shows a mirror of what the
 * bot last reported, so this panel is about saying plainly whether a server is
 * connected, naming it when one is, and offering the two things a board can do
 * about it: add the bot, or disconnect it.
 *
 * Disconnecting is destructive and asks first, as removing a member does. It
 * takes effect on the website immediately and reaches the server itself when
 * the bot next reads its instructions, which the panel says rather than
 * implying it is instant.
 */
describe('the Discord panel on the dashboard', () => {
  it('says when no server is connected, and offers the way to add one', async () => {
    const { findByRole, getByText } = render(DiscordPanel, { props: { rsoId: 4 } });

    await waitFor(() => expect(getRsoDiscord).toHaveBeenCalledWith(4));
    expect(getByText(/no discord server/i)).toBeTruthy();
    const add = await findByRole('link', { name: /add the via bot/i });
    expect(add.getAttribute('href')).toBe(INSTALL);
    expect(add.getAttribute('rel')).toContain('noopener');
  });

  it('names the server that is connected', async () => {
    getRsoDiscord.mockResolvedValue(CONNECTED);
    const { findByText } = render(DiscordPanel, { props: { rsoId: 4 } });
    expect(await findByText('IEEE at Illinois')).toBeTruthy();
  });

  it('asks before it disconnects, rather than disconnecting on one press', async () => {
    getRsoDiscord.mockResolvedValue(CONNECTED);
    const { findByRole, getByRole } = render(DiscordPanel, { props: { rsoId: 4 } });

    await fireEvent.click(await findByRole('button', { name: /disconnect/i }));
    expect(unbindRsoDiscord).not.toHaveBeenCalled();
    expect(getByRole('button', { name: /yes, disconnect/i })).toBeTruthy();
  });

  it('disconnects the server the board confirmed, and says it is done', async () => {
    getRsoDiscord.mockResolvedValue(CONNECTED);
    unbindRsoDiscord.mockResolvedValue(undefined);
    const { findByRole } = render(DiscordPanel, { props: { rsoId: 4 } });

    await fireEvent.click(await findByRole('button', { name: /disconnect/i }));
    getRsoDiscord.mockResolvedValue({ guilds: [], install_url: INSTALL });
    await fireEvent.click(await findByRole('button', { name: /yes, disconnect/i }));

    await waitFor(() => expect(unbindRsoDiscord)
      .toHaveBeenCalledWith(4, '204255221017214977'));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
  });

  it('lets a board change its mind without disconnecting anything', async () => {
    getRsoDiscord.mockResolvedValue(CONNECTED);
    const { findByRole, getByRole } = render(DiscordPanel, { props: { rsoId: 4 } });

    await fireEvent.click(await findByRole('button', { name: /disconnect/i }));
    await fireEvent.click(getByRole('button', { name: /keep it connected/i }));

    expect(unbindRsoDiscord).not.toHaveBeenCalled();
    expect(getByRole('button', { name: /disconnect/i })).toBeTruthy();
  });

  /**
   * A board should not be left wondering whether a refusal happened. The panel
   * says what went wrong in the words the API used.
   */
  it('says so when the website refused to disconnect', async () => {
    getRsoDiscord.mockResolvedValue(CONNECTED);
    unbindRsoDiscord.mockRejectedValue(new Error('No Discord server with that identifier is connected.'));
    const { findByRole } = render(DiscordPanel, { props: { rsoId: 4 } });

    await fireEvent.click(await findByRole('button', { name: /disconnect/i }));
    await fireEvent.click(await findByRole('button', { name: /yes, disconnect/i }));

    await waitFor(() => expect(showToast)
      .toHaveBeenCalledWith(expect.stringContaining('No Discord server'), 'error'));
  });

  /** A panel that could not ask says nothing rather than saying there is nothing. */
  it('does not claim there is no server when it could not ask', async () => {
    getRsoDiscord.mockRejectedValue(new Error('VIA did not answer.'));
    const { container, queryByText } = render(DiscordPanel, { props: { rsoId: 4 } });

    await waitFor(() => expect(getRsoDiscord).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toContain('could not be read'));
    expect(queryByText(/no discord server/i)).toBe(null);
  });
});
