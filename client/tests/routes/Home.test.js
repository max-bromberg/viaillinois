import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getEvents = vi.hoisted(() => vi.fn());
const getRsos = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ getEvents }));
vi.mock('../../src/api/rsos.js', () => ({ getRsos }));

const Home = (await import('../../src/routes/Home.svelte')).default;

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

  it('is headed by what it is showing', async () => {
    const { getByRole } = render(Home);
    await waitFor(() => expect(getByRole('heading', { name: 'Upcoming Events' })).toBeTruthy());
  });

  it('asks for the archive when the reader switches to it', async () => {
    const { getByRole } = render(Home);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());

    await fireEvent.click(getByRole('button', { name: 'Archived' }));

    await waitFor(() => expect(lastFilters().timeframe).toBe('archived'));
    expect(getByRole('heading', { name: 'Archived Events' })).toBeTruthy();
  });

  it('goes back to upcoming events when the reader switches back', async () => {
    const { getByRole } = render(Home);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());

    await fireEvent.click(getByRole('button', { name: 'Archived' }));
    await waitFor(() => expect(lastFilters().timeframe).toBe('archived'));

    await fireEvent.click(getByRole('button', { name: 'Upcoming' }));
    await waitFor(() => expect(lastFilters().timeframe).toBe('upcoming'));
    expect(getByRole('heading', { name: 'Upcoming Events' })).toBeTruthy();
  });

  it('starts the archive at its first page', async () => {
    history.replaceState(null, '', '/?page=3');
    const { getByRole } = render(Home);
    await waitFor(() => expect(lastFilters().offset).toBe(36));

    await fireEvent.click(getByRole('button', { name: 'Archived' }));

    await waitFor(() => expect(lastFilters().timeframe).toBe('archived'));
    expect(lastFilters().offset).toBe(0);
  });
});
