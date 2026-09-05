import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const createEvent = vi.hoisted(() => vi.fn());
const createEventSeries = vi.hoisted(() => vi.fn());
const updateEvent = vi.hoisted(() => vi.fn());
const deleteEvent = vi.hoisted(() => vi.fn());
const cancelEvent = vi.hoisted(() => vi.fn());
const restoreEvent = vi.hoisted(() => vi.fn());
const getRsoStats = vi.hoisted(() => vi.fn());
const getRso = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ createEvent, createEventSeries, updateEvent, deleteEvent, cancelEvent, restoreEvent }));
vi.mock('../../src/api/rsos.js', () => ({
  getRso, updateRso: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(),
  getRsoStats,
}));
vi.mock('../../src/api/users.js', () => ({ getMe: vi.fn().mockResolvedValue({ user: USER }) }));
vi.mock('../../src/api/semester.js', () => ({
  getCurrentSemester: vi.fn().mockResolvedValue({
    semester: { code: '2026-fa', label: 'Fall 2026', instruction_end: '2026-12-09', breaks: [] },
  }),
}));
vi.mock('../../src/api/venues.js', () => ({ searchVenues: vi.fn().mockResolvedValue({ venues: [] }) }));
vi.mock('../../src/stores/ui.js', () => ({ showToast }));
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

const ONE_OFF = {
  event_id: 8, title: 'Career fair', start_time: '2026-10-01 10:00:00', end_time: '2026-10-01 14:00:00',
  is_private: 0, series_id: null, tags: null,
};
const OCCURRENCE = {
  event_id: 5, title: 'IEEE Weekly Meeting', start_time: '2026-09-15 18:00:00', end_time: '2026-09-15 19:30:00',
  is_private: 0, tags: 'Weekly Meeting',
  series_id: 3, series_interval_weeks: 1, series_days_of_week: 'Tue', series_ends_on: '2026-12-08',
};

beforeEach(() => {
  vi.clearAllMocks();
  getRso.mockResolvedValue({ rso: { rso_id: 1, rso_name: 'IEEE', name: 'IEEE', members: [], events: [ONE_OFF, OCCURRENCE] } });
  createEventSeries.mockResolvedValue({ series_id: 3, created: 14, skipped: [] });
  createEvent.mockResolvedValue({ event_id: 9 });
  updateEvent.mockResolvedValue({ ok: true });
  deleteEvent.mockResolvedValue({ ok: true });
  cancelEvent.mockResolvedValue({ ok: true, cancelled_at: '2026-09-04T09:00:00-05:00' });
  restoreEvent.mockResolvedValue({ ok: true, cancelled_at: null });
  getRsoStats.mockResolvedValue({ memberBreakdown: [], topTags: [], interest: [] });
});

/**
 * The dashboard is where a board sets a term of meetings up and where it deals
 * with the one week that has to move.
 */
describe('Dashboard, with repeating events', () => {
  it('marks the events that repeat, and says how', async () => {
    const { findByText } = render(Dashboard);
    expect(await findByText('Repeats')).toBeTruthy();
    expect((await findByText('Repeats')).getAttribute('title')).toBe('Repeats every Tuesday until December 8');
  });

  it('creates a series in one request when the form asks for a repeat', async () => {
    const { findByRole, getByRole, getByLabelText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: '+ Manual entry' }));

    await fireEvent.input(getByLabelText(/Event Title/), { target: { value: 'Weekly meeting' } });
    await fireEvent.input(getByLabelText(/Start Time/), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(getByLabelText(/End Time/), { target: { value: '2026-09-01T19:30' } });
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    await fireEvent.click(getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(createEventSeries).toHaveBeenCalled());
    expect(createEvent).not.toHaveBeenCalled();
    expect(createEventSeries.mock.calls[0][0].recurrence).toMatchObject({
      interval_weeks: 1, days_of_week: ['Tue'], ends_on: '2026-12-09',
    });
  });

  it('says how many events a repeat created', async () => {
    createEventSeries.mockResolvedValue({ series_id: 3, created: 14, skipped: [] });
    const { findByRole, getByRole, getByLabelText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: '+ Manual entry' }));
    await fireEvent.input(getByLabelText(/Event Title/), { target: { value: 'Weekly meeting' } });
    await fireEvent.input(getByLabelText(/Start Time/), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(getByLabelText(/End Time/), { target: { value: '2026-09-01T19:30' } });
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    await fireEvent.click(getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/14 events/), undefined));
  });

  it('names the weeks a repeat could not take, rather than dropping them quietly', async () => {
    createEventSeries.mockResolvedValue({ series_id: 3, created: 12, skipped: ['2026-10-06', '2026-11-03'] });
    const { findByRole, getByRole, getByLabelText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: '+ Manual entry' }));
    await fireEvent.input(getByLabelText(/Event Title/), { target: { value: 'Weekly meeting' } });
    await fireEvent.input(getByLabelText(/Start Time/), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(getByLabelText(/End Time/), { target: { value: '2026-09-01T19:30' } });
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    await fireEvent.click(getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      expect.stringMatching(/2026-10-06/), expect.anything()
    ));
  });

  it('creates a single event when no repeat is asked for', async () => {
    const { findByRole, getByRole, getByLabelText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: '+ Manual entry' }));
    await fireEvent.input(getByLabelText(/Event Title/), { target: { value: 'Career fair' } });
    await fireEvent.input(getByLabelText(/Start Time/), { target: { value: '2026-10-01T10:00' } });
    await fireEvent.input(getByLabelText(/End Time/), { target: { value: '2026-10-01T14:00' } });
    await fireEvent.click(getByRole('button', { name: 'Create event' }));

    await waitFor(() => expect(createEvent).toHaveBeenCalled());
    expect(createEventSeries).not.toHaveBeenCalled();
  });

  /**
   * Deleting one week of a weekly meeting and deleting the meeting are
   * different things, so the dashboard asks which was meant.
   */
  it('asks which weeks a deletion is for, when the event repeats', async () => {
    const { findAllByRole, getByRole } = render(Dashboard);
    const deletes = await findAllByRole('button', { name: 'Delete' });
    await fireEvent.click(deletes[1]);

    expect(getByRole('button', { name: 'This event only' })).toBeTruthy();
    await fireEvent.click(getByRole('button', { name: 'This and all later events' }));
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(5, 'following'));
  });

  it('deletes the whole series when that is what was chosen', async () => {
    const { findAllByRole, getByRole } = render(Dashboard);
    const deletes = await findAllByRole('button', { name: 'Delete' });
    await fireEvent.click(deletes[1]);
    await fireEvent.click(getByRole('button', { name: 'All events in the series' }));
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(5, 'all'));
  });

  it('deletes an event that does not repeat without asking anything', async () => {
    const { findAllByRole } = render(Dashboard);
    const deletes = await findAllByRole('button', { name: 'Delete' });
    await fireEvent.click(deletes[0]);
    await waitFor(() => expect(deleteEvent).toHaveBeenCalledWith(8, 'one'));
  });

  it('asks which weeks an edit is for, when the event repeats', async () => {
    const { findAllByRole, getByRole } = render(Dashboard);
    const edits = await findAllByRole('button', { name: 'Edit' });
    await fireEvent.click(edits[1]);
    await fireEvent.click(getByRole('button', { name: 'Update event' }));

    expect(getByRole('button', { name: 'This event only' })).toBeTruthy();
    await fireEvent.click(getByRole('button', { name: 'This event only' }));
    await waitFor(() => expect(updateEvent).toHaveBeenCalledWith(5, expect.any(Object), 'one'));
  });
});

/**
 * Cancelling is a state, not a delete. The row says so, and the same place
 * offers to put the event back.
 */
describe('Dashboard, cancelling an event', () => {
  it('cancels an event from its row and reloads the list', async () => {
    const { findAllByRole } = render(Dashboard);
    const cancels = await findAllByRole('button', { name: 'Cancel event' });
    await fireEvent.click(cancels[0]);
    await waitFor(() => expect(cancelEvent).toHaveBeenCalledWith(8, 'one'));
    await waitFor(() => expect(getRso).toHaveBeenCalledTimes(2));
    expect(showToast).toHaveBeenCalledWith('Event cancelled');
  });

  it('marks a cancelled event and offers to restore it instead', async () => {
    getRso.mockResolvedValue({ rso: { rso_id: 1, rso_name: 'IEEE', name: 'IEEE', members: [],
      events: [{ ...ONE_OFF, cancelled_at: '2026-09-04 09:00:00' }] } });
    const { findByText, findByRole, queryByRole } = render(Dashboard);
    expect(await findByText('Cancelled')).toBeTruthy();
    const restore = await findByRole('button', { name: 'Restore event' });
    expect(queryByRole('button', { name: 'Cancel event' })).toBeNull();
    await fireEvent.click(restore);
    await waitFor(() => expect(restoreEvent).toHaveBeenCalledWith(8, 'one'));
    expect(showToast).toHaveBeenCalledWith('Event restored');
  });

  /**
   * A repeating event is cancelled a week at a time or a term at a time, and
   * only the board knows which. Without the question, cancelling a term of
   * meetings was one click per week and cancelling the wrong week was the
   * likely outcome.
   */
  it('asks which weeks a cancellation means when the event repeats', async () => {
    const { findAllByRole, findByRole } = render(Dashboard);
    const cancels = await findAllByRole('button', { name: 'Cancel event' });
    await fireEvent.click(cancels[1]);
    expect(cancelEvent).not.toHaveBeenCalled();

    await findByRole('heading', { name: /cancel a repeating event/i });
    await fireEvent.click(await findByRole('button', { name: 'All events in the series' }));
    await waitFor(() => expect(cancelEvent).toHaveBeenCalledWith(5, 'all'));
    expect(showToast).toHaveBeenCalledWith('Events cancelled');
  });

  it('cancels one week of a repeat when that is what the board chose', async () => {
    const { findAllByRole, findByRole } = render(Dashboard);
    const cancels = await findAllByRole('button', { name: 'Cancel event' });
    await fireEvent.click(cancels[1]);
    await fireEvent.click(await findByRole('button', { name: 'This event only' }));
    await waitFor(() => expect(cancelEvent).toHaveBeenCalledWith(5, 'one'));
    expect(showToast).toHaveBeenCalledWith('Event cancelled');
  });

  it('asks the same question before putting a repeating event back', async () => {
    getRso.mockResolvedValue({ rso: { rso_id: 1, rso_name: 'IEEE', name: 'IEEE', members: [],
      events: [{ ...OCCURRENCE, cancelled_at: '2026-09-04 09:00:00' }] } });
    const { findByRole } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: 'Restore event' }));
    expect(restoreEvent).not.toHaveBeenCalled();

    await findByRole('heading', { name: /restore a repeating event/i });
    await fireEvent.click(await findByRole('button', { name: 'This and all later events' }));
    await waitFor(() => expect(restoreEvent).toHaveBeenCalledWith(5, 'following'));
  });
});

/**
 * Interest is what replaced the RSVP count, and the board reads it on the
 * insights tab beside the members and the tags.
 */
describe('Dashboard, interest on the insights tab', () => {
  it('lists how many people are interested in each upcoming event', async () => {
    getRsoStats.mockResolvedValue({ memberBreakdown: [], topTags: [], interest: [
      { event_id: 8, title: 'Career fair', start_time: '2026-10-01T10:00:00-05:00', interest_count: 12 },
      { event_id: 5, title: 'IEEE Weekly Meeting', start_time: '2026-09-15T18:00:00-05:00', interest_count: 1 },
    ] });
    const { findByRole, findByText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: 'Insights' }));
    expect(await findByText('12 interested')).toBeTruthy();
    expect(await findByText('1 interested')).toBeTruthy();
  });

  it('says so when nobody has shown interest yet', async () => {
    const { findByRole, findByText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: 'Insights' }));
    expect(await findByText('Nobody has shown interest in an upcoming event yet.')).toBeTruthy();
  });
});

/**
 * What people thought of an event they went to. The board reads the average,
 * how many said something, and what they wrote, and never who wrote which,
 * because a board that can work that out is a board nobody tells the truth to.
 */
describe('Dashboard, feedback on the insights tab', () => {
  const FEEDBACK = [
    {
      event_id: 8, title: 'Career fair', start_time: '2026-10-01T10:00:00-05:00',
      average_rating: 4.5, rating_count: 2,
      comments: ['The pizza arrived on time.', 'Too loud in the hallway.'],
    },
    {
      event_id: 5, title: 'IEEE Weekly Meeting', start_time: '2026-09-15T18:00:00-05:00',
      average_rating: null, rating_count: 0, comments: [],
    },
  ];

  it('shows the average, the count and the comments for each event', async () => {
    getRsoStats.mockResolvedValue({
      memberBreakdown: [], topTags: [], interest: [], feedback: FEEDBACK,
    });
    const { findByRole, findByText, getByText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: 'Insights' }));

    expect(await findByText('Career fair')).toBeTruthy();
    expect(getByText('4.5 out of 5, from 2 ratings')).toBeTruthy();
    expect(getByText('The pizza arrived on time.')).toBeTruthy();
    expect(getByText('Too loud in the hallway.')).toBeTruthy();
  });

  it('says when an event has no ratings yet rather than showing an empty average', async () => {
    getRsoStats.mockResolvedValue({
      memberBreakdown: [], topTags: [], interest: [], feedback: FEEDBACK,
    });
    const { findByRole, findByText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: 'Insights' }));
    expect(await findByText('Nobody has rated this event yet.')).toBeTruthy();
  });

  it('never names anybody who rated an event', async () => {
    getRsoStats.mockResolvedValue({
      memberBreakdown: [], topTags: [], interest: [], feedback: FEEDBACK,
    });
    const { findByRole, container } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: 'Insights' }));
    await findByRole('heading', { name: /what people thought/i });
    expect(container.textContent).not.toMatch(/net_?id/i);
    expect(container.textContent).not.toMatch(/rgarcia7|boardmember/);
  });

  it('says so when nobody has rated anything at all', async () => {
    getRsoStats.mockResolvedValue({
      memberBreakdown: [], topTags: [], interest: [], feedback: [],
    });
    const { findByRole, findByText } = render(Dashboard);
    await fireEvent.click(await findByRole('button', { name: 'Insights' }));
    expect(await findByText('Nobody has rated an event yet.')).toBeTruthy();
  });
});
