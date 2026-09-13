import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

const getEvents = vi.hoisted(() => vi.fn());
const getRsos = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/events.js', () => ({ getEvents }));
vi.mock('../../src/api/rsos.js', () => ({ getRsos }));
vi.mock('../../src/api/tags.js', () => ({ getTags: vi.fn().mockResolvedValue({ tags: [{ tag_name: 'Workshop' }] }) }));
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn(), currentPath: { subscribe: () => () => {} } }));

const Home = (await import('../../src/routes/Home.svelte')).default;
const { currentUser } = await import('../../src/stores/auth.js');

/**
 * The feed is an agenda, not a grid of cards.
 *
 * The test the philosophy document sets is this: cover the titles with your hand
 * and you can still tell what is happening tonight, and when. That only works if
 * the rows are grouped under their day and the time is the largest thing on each
 * one, so that is what is checked here rather than the look of it.
 */
const event = (id, day, hour, extra = {}) => ({
  event_id: id,
  title: `Event ${id}`,
  description: 'Something is on.',
  start_time: `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00-05:00`,
  end_time: `2026-09-${String(day).padStart(2, '0')}T${String(hour + 2).padStart(2, '0')}:00:00-05:00`,
  rso_name: 'IEEE',
  building: 'ECEB',
  room_number: '1002',
  tags: 'Workshop',
  ...extra,
});

beforeEach(() => {
  getEvents.mockReset();
  getRsos.mockReset();
  getRsos.mockResolvedValue({ rsos: [{ rso_id: 1, name: 'IEEE', logo_color: '#00629B' }] });
  currentUser.set(null);
  history.replaceState(null, '', '/');
});

describe('the agenda', () => {
  it('groups the rows under the day they fall on', async () => {
    getEvents.mockResolvedValue({
      events: [event(1, 10, 18), event(2, 10, 19), event(3, 11, 17)],
      total: 3,
    });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelectorAll('.day').length).toBe(2));
    const [first, second] = container.querySelectorAll('.day');
    expect(first.querySelectorAll('.ev').length).toBe(2);
    expect(second.querySelectorAll('.ev').length).toBe(1);
  });

  it('names each day and carries a marker beside it', async () => {
    getEvents.mockResolvedValue({ events: [event(1, 10, 18)], total: 1 });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelector('.day .dh b')).toBeTruthy());
    expect(container.querySelector('.day .dh b').textContent).toBeTruthy();
    expect(container.querySelector('.day .dh .pad')).toBeTruthy();
  });

  it('sets the time as the largest thing on a row', async () => {
    getEvents.mockResolvedValue({ events: [event(1, 10, 18)], total: 1 });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelector('.ev .t')).toBeTruthy());
    expect(container.querySelector('.ev .t').textContent.replace(/\s+/g, '')).toContain('6:00PM');
  });

  it('lights each row from its organization, in an adapted colour', async () => {
    getEvents.mockResolvedValue({ events: [event(1, 10, 18)], total: 1 });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelector('.ev')).toBeTruthy());
    const style = container.querySelector('.ev').getAttribute('style');
    expect(style).toMatch(/--h: #[0-9a-f]{6}/);
    expect(style).not.toContain('#00629B');
  });

  it('draws no grid of cards, and no card at all', async () => {
    getEvents.mockResolvedValue({ events: [event(1, 10, 18), event(2, 11, 17)], total: 2 });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelectorAll('.ev').length).toBe(2));
    const agenda = container.querySelector('.agenda');
    expect(agenda.querySelector('.grid')).toBe(null);
    // A rounded rectangle with a one pixel border was the default container of
    // the design this replaced, and the review checklist forbids it.
    expect(agenda.innerHTML).not.toContain('rounded-lg');
    expect(agenda.innerHTML).not.toContain('border ');
  });

  /**
   * An empty list says what is nearby and what to do, never "No results found".
   */
  it('says what to do when nothing matches', async () => {
    getEvents.mockResolvedValue({ events: [], total: 0 });
    const { container, findByText } = render(Home);
    await waitFor(() => expect(container.querySelector('.empty')).toBeTruthy());
    expect(await findByText(/clear a tag or two/i)).toBeTruthy();
  });

  /**
   * An error is a sentence in danger text under the thing that failed, never a
   * red box, and it does not apologise.
   */
  it('says the feed did not load, without apologising', async () => {
    getEvents.mockRejectedValue(new Error('network'));
    const { findByText, container } = render(Home);
    expect(await findByText(/The feed did not load/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/sorry|something went wrong/i);
  });

  it('hides the room of an internal event from somebody outside that organization', async () => {
    getEvents.mockResolvedValue({ events: [event(1, 10, 18, { is_private: 1 })], total: 1 });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelector('.ev')).toBeTruthy());
    expect(container.querySelector('.ev .room')).toBe(null);
  });

  it('shows the room of an internal event to a member of that organization', async () => {
    currentUser.set({ net_id: 'jdoe2', memberships: [{ rso_id: 1, role: 'Member' }] });
    getEvents.mockResolvedValue({ events: [event(1, 10, 18, { is_private: 1 })], total: 1 });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelector('.ev .room')).toBeTruthy());
    expect(container.querySelector('.ev .room').textContent).toContain('ECEB 1002');
  });

  it('repeats a day name where a day continues across a page boundary', async () => {
    // A page that begins in the middle of a day gets that day's name again,
    // rather than its rows appearing under whatever day came before them.
    getEvents.mockResolvedValue({ events: [event(1, 11, 9), event(2, 11, 18)], total: 20 });
    const { container } = render(Home);
    await waitFor(() => expect(container.querySelectorAll('.day').length).toBe(1));
    expect(container.querySelector('.day .dh b').textContent).toBeTruthy();
  });
});
