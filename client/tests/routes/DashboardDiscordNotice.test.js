import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getRso = vi.hoisted(() => vi.fn());
const getRsoDiscord = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({
  createEvent: vi.fn(), createEventSeries: vi.fn(), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), cancelEvent: vi.fn(), restoreEvent: vi.fn(),
}));
vi.mock('../../src/api/rsos.js', () => ({
  getRso, updateRso: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(),
  getRsoStats: vi.fn().mockResolvedValue({ memberBreakdown: [], topTags: [], interest: [] }),
}));
vi.mock('../../src/api/rsoDiscord.js', () => ({ getRsoDiscord, unbindRsoDiscord: vi.fn() }));
vi.mock('../../src/api/users.js', () => ({ getMe: vi.fn().mockResolvedValue({ user: null }) }));
vi.mock('../../src/api/semester.js', () => ({
  getCurrentSemester: vi.fn().mockResolvedValue({
    semester: { code: '2026-fa', label: 'Fall 2026', instruction_end: '2026-12-09', breaks: [] },
  }),
}));
vi.mock('../../src/api/venues.js', () => ({ searchVenues: vi.fn().mockResolvedValue({ venues: [] }) }));
vi.mock('../../src/api/calendar.js', () => ({ importCalendar: vi.fn() }));
vi.mock('../../src/stores/ui.js', async importOriginal => ({
  ...await importOriginal(), showToast: vi.fn(),
}));
vi.mock('../../src/lib/router.js', () => ({
  navigate: vi.fn(),
  currentPath: { subscribe: fn => { fn('/dashboard'); return () => {}; } },
}));

const USER = {
  net_id: 'boardmember',
  memberships: [{ rso_id: 1, role: 'Board' }],
  is_global_admin: false,
};

vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: fn => { fn(USER); return () => {}; }, set: vi.fn() },
  adminRsoIds: { subscribe: fn => { fn([1]); return () => {}; } },
  boardRsoIds: { subscribe: fn => { fn([1]); return () => {}; } },
}));

const Dashboard = (await import('../../src/routes/Dashboard.svelte')).default;

const INSTALL = 'https://discord.com/oauth2/authorize?client_id=1055&scope=bot';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  getRso.mockResolvedValue({
    rso: { rso_id: 1, rso_name: 'IEEE', name: 'IEEE', members: [], events: [] },
  });
  getRsoDiscord.mockResolvedValue({ guilds: [], install_url: INSTALL });
});

/**
 * The reminder that a board has not connected a Discord server yet.
 *
 * It is a reminder rather than a demand. A board that has no Discord server,
 * or does not want one, is running their organization perfectly well, so this
 * is one quiet line with a way to act on it and a way to put it away, and it
 * never stands between somebody and the work they opened the dashboard to do.
 */
describe('the dashboard notice about Discord', () => {
  it('reminds a board with no server connected, in one quiet line', async () => {
    const { findByText, getByRole } = render(Dashboard);

    expect(await findByText(/not connected to discord/i)).toBeTruthy();
    expect(getByRole('link', { name: /add the via bot/i }).getAttribute('href')).toBe(INSTALL);
  });

  it('says nothing at all to a board that has connected one', async () => {
    getRsoDiscord.mockResolvedValue({
      guilds: [{ guild_id: '204255221017214977', guild_name: 'IEEE at Illinois' }],
      install_url: INSTALL,
    });
    const { queryByText } = render(Dashboard);

    await waitFor(() => expect(getRsoDiscord).toHaveBeenCalled());
    expect(queryByText(/not connected to discord/i)).toBe(null);
  });

  /** A reminder that cannot be put away is not subtle, whatever it looks like. */
  it('can be put away, and stays away on the next visit', async () => {
    const first = render(Dashboard);
    await fireEvent.click(await first.findByRole('button', { name: /dismiss/i }));
    expect(first.queryByText(/not connected to discord/i)).toBe(null);
    first.unmount();

    const again = render(Dashboard);
    await waitFor(() => expect(getRsoDiscord).toHaveBeenCalledTimes(2));
    expect(again.queryByText(/not connected to discord/i)).toBe(null);
  });

  /**
   * Put away for one organization is not put away for another. Somebody on two
   * boards has two separate decisions to make.
   */
  it('is put away for the organization it was put away on, and no other', async () => {
    window.localStorage.setItem('via.discordNotice.dismissed', JSON.stringify([2]));
    const { findByText } = render(Dashboard);
    expect(await findByText(/not connected to discord/i)).toBeTruthy();
  });

  /** A lookup that failed is not a board without a server. */
  it('says nothing when whether a server is connected could not be read', async () => {
    getRsoDiscord.mockRejectedValue(new Error('VIA did not answer.'));
    const { queryByText } = render(Dashboard);

    await waitFor(() => expect(getRsoDiscord).toHaveBeenCalled());
    expect(queryByText(/not connected to discord/i)).toBe(null);
  });
});
