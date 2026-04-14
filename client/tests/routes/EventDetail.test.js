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
  getEventRsvps: vi.fn().mockResolvedValue({ counts: { Going: 3, Maybe: 1, 'Not Going': 0 } }),
  rsvpEvent: vi.fn(),
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

  it('shows sign-in nudge for unauthenticated users', async () => {
    const { getByText } = render(EventDetail, { id: 1 });
    await waitFor(() => {
      expect(getByText(/Sign in/)).toBeTruthy();
    });
  });
});
