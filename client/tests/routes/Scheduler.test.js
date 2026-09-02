import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const recommend = vi.hoisted(() => vi.fn());
const createEvent = vi.hoisted(() => vi.fn());
const createEventSeries = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/scheduler.js', () => ({ recommend }));
vi.mock('../../src/api/events.js', () => ({ createEvent, createEventSeries }));
vi.mock('../../src/api/midterms.js', () => ({ getCourses: vi.fn().mockResolvedValue({ courses: [] }) }));
vi.mock('../../src/api/locations.js', () => ({ searchLocations: vi.fn().mockResolvedValue({ locations: [] }) }));
vi.mock('../../src/api/venues.js', () => ({ searchVenues: vi.fn().mockResolvedValue({ venues: [] }) }));
vi.mock('../../src/api/semester.js', () => ({
  getCurrentSemester: vi.fn().mockResolvedValue({
    semester: { code: '2026-fa', label: 'Fall 2026', instruction_end: '2026-12-09', breaks: [] },
  }),
}));
vi.mock('../../src/stores/ui.js', () => ({ showToast }));
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn() }));
vi.mock('../../src/stores/auth.js', () => ({
  currentUser: {
    subscribe: fn => {
      fn({ net_id: 'boardmember', memberships: [{ rso_id: 1, role: 'Board', name: 'IEEE' }] });
      return () => {};
    },
  },
  adminRsoIds: { subscribe: fn => { fn([1]); return () => {}; } },
}));

const Scheduler = (await import('../../src/routes/Scheduler.svelte')).default;

const PICK = {
  start: '2026-09-01 18:00:00',
  end: '2026-09-01 19:00:00',
  location: { location_id: 7, building: 'Electrical & Computer Eng Bldg', room_number: '1002', max_capacity: 240 },
  score: 91,
  insights: [{ type: 'positive', text: 'This room is free for 14 of 15 weeks' }],
  recurrence: {
    interval_weeks: 1, days_of_week: ['Tue'],
    occurrences: ['2026-09-01', '2026-09-08'], weeks_total: 15, weeks_clear: 14,
    conflicts: ['2026-10-06'], until: '2026-12-08',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  recommend.mockResolvedValue({ curatedPicks: [PICK], allOptions: [PICK] });
  createEventSeries.mockResolvedValue({ series_id: 3, created: 14, skipped: [] });
});

/** Walk the wizard from the first step to the search button. */
async function search(ui, { repeat = null } = {}) {
  const next = () => ui.getByRole('button', { name: 'Next →' });
  await fireEvent.click(next());                       // to When
  if (repeat) await fireEvent.click(ui.getByRole('button', { name: repeat }));
  await fireEvent.click(next());                       // to Where
  await fireEvent.click(next());                       // to Who
  await fireEvent.click(next());                       // to Review
  await fireEvent.click(ui.getByRole('button', { name: 'Generate Suggestions' }));
}

/**
 * The scheduler is asked which evening works for the term, so the search
 * carries the repeat and the pick creates the whole series.
 */
describe('Scheduler, searching for a repeat', () => {
  it('offers a repeat alongside the dates', async () => {
    const ui = render(Scheduler);
    await fireEvent.click(ui.getByRole('button', { name: 'Next →' }));
    expect(ui.getByRole('button', { name: 'Every week' })).toBeTruthy();
    expect(ui.getByRole('button', { name: 'Every other week' })).toBeTruthy();
  });

  it('searches for one event when no repeat is chosen', async () => {
    const ui = render(Scheduler);
    await search(ui);
    await waitFor(() => expect(recommend).toHaveBeenCalled());
    expect(recommend.mock.calls[0][0].recurrence).toBeNull();
  });

  it('carries the repeat into the search, ending where the term does', async () => {
    const ui = render(Scheduler);
    await search(ui, { repeat: 'Every week' });
    await waitFor(() => expect(recommend).toHaveBeenCalled());
    expect(recommend.mock.calls[0][0].recurrence).toMatchObject({
      intervalWeeks: 1, until: '2026-12-09',
    });
  });

  it('creates the whole series from a recommendation that repeats', async () => {
    const ui = render(Scheduler);
    await search(ui, { repeat: 'Every week' });
    await waitFor(() => expect(ui.getAllByText(/free for 14 of 15 weeks/).length).toBeGreaterThan(0));

    await fireEvent.click(ui.getAllByRole('button', { name: /Select this slot/ })[0]);
    await fireEvent.input(ui.getByLabelText(/Event Title/), { target: { value: 'Weekly meeting' } });
    await fireEvent.click(ui.getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(createEventSeries).toHaveBeenCalled());
    expect(createEvent).not.toHaveBeenCalled();
    expect(createEventSeries.mock.calls[0][0].recurrence).toMatchObject({
      interval_weeks: 1, days_of_week: ['Tue'], ends_on: '2026-12-08',
    });
  });
});
