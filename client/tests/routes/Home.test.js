import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getEvents = vi.hoisted(() => vi.fn());
const getRsos = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ getEvents }));
vi.mock('../../src/api/rsos.js', () => ({ getRsos }));
vi.mock('../../src/api/tags.js', () => ({ getTags: vi.fn().mockResolvedValue({ tags: [{ tag_name: 'Workshop' }] }) }));
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn() }));

const { currentUser } = await import('../../src/stores/auth.js');
const Home = (await import('../../src/routes/Home.svelte')).default;

/** Who is looking, expressed the way the auth store reads it. */
const signedInAs = memberships => currentUser.set({ net_id: 'jdoe2', memberships });

const EVENT = {
  event_id: 1,
  title: 'PCB Design Workshop',
  description: 'Lay out a two layer board.',
  start_time: '2026-10-01 18:00:00',
  end_time:   '2026-10-01 20:00:00',
  rso_name: 'HKN',
  is_private: 0,
  tags: 'Workshop',
};

/** The filters the last request carried. */
const lastFilters = () => getEvents.mock.calls.at(-1)[0];

beforeEach(() => {
  getEvents.mockReset();
  getEvents.mockResolvedValue({ events: [EVENT], total: 1 });
  getRsos.mockReset();
  getRsos.mockResolvedValue({ rsos: [] });
  history.replaceState(null, '', '/');
  currentUser.set(null);
});

/**
 * The feed is what is on this week, so it opens on what is still to come.
 * Events that have already happened are in the archive, one click away, rather
 * than mixed in with them.
 */
describe('Home', () => {
  it('asks for upcoming events when it opens', async () => {
    render(Home);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    expect(lastFilters().timeframe).toBe('upcoming');
  });

  /**
   * The reference render heads the feed with the one word and puts the count
   * beside it, so "Upcoming" and "12 events" are two things rather than one
   * phrase. The behaviour is unchanged: the heading still says which half of the
   * feed is being read.
   */
  it('is headed by what it is showing, with the count beside it', async () => {
    const { getByRole, container } = render(Home);
    await waitFor(() => expect(getByRole('heading', { name: 'Upcoming' })).toBeTruthy());
    expect(container.querySelector('.feedhead span').textContent).toBe('1 event');
  });

  it('asks for the archive when the reader switches to it', async () => {
    const { getByRole } = render(Home);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());

    await fireEvent.click(getByRole('button', { name: 'Past' }));

    await waitFor(() => expect(lastFilters().timeframe).toBe('archived'));
    expect(getByRole('heading', { name: 'Past' })).toBeTruthy();
  });

  it('goes back to upcoming events when the reader switches back', async () => {
    const { getByRole } = render(Home);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());

    await fireEvent.click(getByRole('button', { name: 'Past' }));
    await waitFor(() => expect(lastFilters().timeframe).toBe('archived'));

    await fireEvent.click(getByRole('button', { name: 'Upcoming' }));
    await waitFor(() => expect(lastFilters().timeframe).toBe('upcoming'));
    expect(getByRole('heading', { name: 'Upcoming' })).toBeTruthy();
  });

  it('starts the archive at its first page', async () => {
    history.replaceState(null, '', '/?page=3');
    const { getByRole } = render(Home);
    await waitFor(() => expect(lastFilters().offset).toBe(36));

    await fireEvent.click(getByRole('button', { name: 'Past' }));

    await waitFor(() => expect(lastFilters().timeframe).toBe('archived'));
    expect(lastFilters().offset).toBe(0);
  });
});

/**
 * The wording of the two halves of the feed, and the way into scheduling.
 *
 * Archived is what a database calls a row nobody deleted. What a student means
 * is that the event has already happened, so the feed says past. And a board
 * member reading the feed had no way from it to the place events are created.
 */
describe('Home, the feed wording and the board shortcut', () => {
  /**
   * The rail is words rather than a panel now, so there is no longer a control
   * that opens it. On a narrow screen it stacks above the agenda instead.
   */
  it('calls what has already happened past rather than archived', async () => {
    const { getByRole, findByRole, queryByText } = render(Home);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    await fireEvent.click(await findByRole('button', { name: 'Past' }));
    await waitFor(() => expect(getByRole('heading', { name: 'Past' })).toBeTruthy());
    expect(queryByText(/Archived/)).toBeNull();
    // The wire value is unchanged: the website, the API and the Discord bot all
    // still name this timeframe the same thing.
    expect(lastFilters().timeframe).toBe('archived');
  });

  it('offers a board member the way to schedule an event', async () => {
    signedInAs([{ rso_id: 1, role: 'Board' }]);
    const { findByRole } = render(Home);
    expect(await findByRole('button', { name: /Schedule an event/i })).toBeTruthy();
  });

  it('offers a reader who runs nothing no such button', async () => {
    signedInAs([{ rso_id: 1, role: 'Member' }]);
    const { queryByRole } = render(Home);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    expect(queryByRole('button', { name: /Schedule an event/i })).toBeNull();
  });
});
