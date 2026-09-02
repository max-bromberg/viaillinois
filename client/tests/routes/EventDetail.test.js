import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import EventDetail from '../../src/routes/EventDetail.svelte';

vi.mock('../../src/api/events.js', () => ({
  getEvent: vi.fn().mockResolvedValue({
    event: {
      event_id: 1,
      rso_id: 2,
      title: 'IEEE Workshop',
      description: 'Learn **PCB design** with us.',
      start_time: '2026-04-20T18:00:00',
      end_time:   '2026-04-20T20:00:00',
      is_private: false,
      rso_name: 'IEEE UIUC',
      building: 'ECEB',
      room_number: '1002',
      max_capacity: 40,
      tags: 'Workshop, Free Food',
    },
  }),
}));

vi.mock('../../src/api/rsos.js', () => ({
  getRso: vi.fn().mockResolvedValue({
    rso: {
      rso_id: 2,
      rso_name: 'IEEE UIUC',
      description: 'Advancing technology for humanity.',
      logo_color: '#006EB6',
      founded_year: 2005,
      event_count: 12,
      members: [],
    },
  }),
}));

vi.mock('../../src/stores/auth.js', () => ({
  currentUser: { subscribe: (fn) => { fn(null); return () => {}; } },
}));

vi.mock('../../src/stores/ui.js', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../src/lib/router.js', () => ({
  navigate: vi.fn(),
  currentPath: { subscribe: (fn) => { fn('/events/1'); return () => {}; } },
  routeParams: { subscribe: (fn) => { fn({ id: '1' }); return () => {}; } },
  matchRoute: vi.fn().mockReturnValue({ name: 'event-detail', params: { id: '1' } }),
}));

describe('EventDetail', () => {
  it('renders event title after loading', async () => {
    const { getByRole } = render(EventDetail, { id: 1 });
    await waitFor(() => {
      expect(getByRole('heading', { name: 'IEEE Workshop' })).toBeTruthy();
    });
  });

  it('renders location', async () => {
    const { getByText } = render(EventDetail, { id: 1 });
    await waitFor(() => {
      expect(getByText(/ECEB 1002/)).toBeTruthy();
    });
  });

  /**
   * RSVPs are gone, so the page no longer holds a card asking the reader to
   * sign in to say whether they are going.
   */
  it('shows no RSVP card', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.textContent).not.toMatch(/RSVP/i);
    expect(container.textContent).not.toMatch(/who's going/i);
  });
});

/**
 * Event detail was missed when the location became optional, so an event held
 * somewhere that is not a room rendered a bare pin with nothing beside it.
 */
describe('EventDetail location', () => {
  const base = {
    event_id: 1, rso_id: 2, title: 'IEEE Workshop', description: 'Something',
    start_time: '2026-04-20T18:00:00', end_time: '2026-04-20T20:00:00',
    is_private: false, rso_name: 'IEEE UIUC',
    building: null, room_number: null, location_text: null,
  };

  it('shows the free text when there is no room', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: { ...base, location_text: 'Zoom' } });
    const { findByText } = render(EventDetail, { id: '1' });
    expect(await findByText(/Zoom/)).toBeTruthy();
  });

  it('says the location is undecided when there is neither', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({ event: base });
    const { findByText } = render(EventDetail, { id: '1' });
    expect(await findByText(/Location to be announced/)).toBeTruthy();
  });
});

/**
 * Somebody who lands on one week of a weekly meeting should be able to tell
 * that it is a weekly meeting.
 */
describe('EventDetail, for an event that repeats', () => {
  it('says how it repeats and when it stops', async () => {
    const { getEvent } = await import('../../src/api/events.js');
    getEvent.mockResolvedValueOnce({
      event: {
        event_id: 1, rso_id: 2, title: 'IEEE Weekly Meeting',
        start_time: '2026-09-15T18:00:00', end_time: '2026-09-15T19:30:00',
        is_private: false, rso_name: 'IEEE UIUC',
        series_id: 3, series_interval_weeks: 1, series_days_of_week: 'Tue', series_ends_on: '2026-12-08',
      },
    });
    const { findByText } = render(EventDetail, { id: '1' });
    expect(await findByText('Repeats every Tuesday until December 8')).toBeTruthy();
  });

  it('says nothing of the sort for an event that does not repeat', async () => {
    const { container, findByRole } = render(EventDetail, { id: 1 });
    await findByRole('heading', { name: 'IEEE Workshop' });
    expect(container.textContent).not.toMatch(/Repeats/);
  });
});
