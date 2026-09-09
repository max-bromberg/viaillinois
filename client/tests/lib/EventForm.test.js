import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import EventForm from '../../src/lib/EventForm.svelte';

vi.mock('../../src/api/venues.js', () => ({ searchVenues: vi.fn().mockResolvedValue({ venues: [] }) }));

const SEMESTER = { code: '2026-fa', label: 'Fall 2026', instruction_end: '2026-12-09', breaks: [] };

const setUp = (props = {}) => render(EventForm, {
  rsoId: 1,
  semester: SEMESTER,
  initial: { start_time: '2026-09-01 18:00:00', end_time: '2026-09-01 19:30:00' },
  ...props,
});

/**
 * Most of what an RSO holds repeats, and entering a term of it one week at a
 * time is what boards were doing instead.
 */
describe('EventForm repeat controls', () => {
  it('offers a repeat, and does not ask for one by default', () => {
    const { getByRole } = setUp();
    expect(getByRole('button', { name: 'Does not repeat' }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: 'Every week' })).toBeTruthy();
    expect(getByRole('button', { name: 'Every other week' })).toBeTruthy();
  });

  it('asks which days only once a repeat is chosen', async () => {
    const { getByRole, queryByRole } = setUp();
    expect(queryByRole('button', { name: 'Tue' })).toBeNull();
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    expect(getByRole('button', { name: 'Tue' })).toBeTruthy();
  });

  it('starts on the day the event is already set to', async () => {
    const { getByRole } = setUp();
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    // The first of September 2026 is a Tuesday.
    expect(getByRole('button', { name: 'Tue' }).getAttribute('aria-pressed')).toBe('true');
    expect(getByRole('button', { name: 'Wed' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('says what it would create, in words', async () => {
    const { getByRole, getByText } = setUp();
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    expect(getByText('Repeats every Tuesday until December 9')).toBeTruthy();
  });

  it('says when the term ends, so the date it chose can be corrected', async () => {
    const { getByRole, getByText } = setUp();
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    expect(getByText(/Fall 2026 instruction ends on 2026-12-09/)).toBeTruthy();
  });

  it('repeats on more than one day when more than one is chosen', async () => {
    const { getByRole, getByText } = setUp();
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    await fireEvent.click(getByRole('button', { name: 'Thu' }));
    expect(getByText('Repeats every Tuesday and Thursday until December 9')).toBeTruthy();
  });

  it('reads every other week as a fortnight', async () => {
    const { getByRole, getByText } = setUp();
    await fireEvent.click(getByRole('button', { name: 'Every other week' }));
    expect(getByText('Repeats every other Tuesday until December 9')).toBeTruthy();
  });

  it('will not submit a repeat with no days on it', async () => {
    const { getByRole } = setUp({ initial: { title: 'Weekly meeting', start_time: '2026-09-01 18:00:00', end_time: '2026-09-01 19:30:00' } });
    await fireEvent.click(getByRole('button', { name: 'Every week' }));
    await fireEvent.click(getByRole('button', { name: 'Tue' }));
    expect(getByRole('button', { name: 'Create event' }).disabled).toBe(true);
  });

  /**
   * Changing the rule of a series that already exists is out of scope, so the
   * form says what the series does rather than offering to change it.
   */
  it('describes the repeat instead of offering one when editing an occurrence', () => {
    const { getByText, queryByRole } = setUp({
      initial: {
        event_id: 5, title: 'Weekly meeting',
        start_time: '2026-09-01 18:00:00', end_time: '2026-09-01 19:30:00',
        series_id: 3, series_interval_weeks: 1, series_days_of_week: 'Tue', series_ends_on: '2026-12-08',
      },
    });
    expect(queryByRole('button', { name: 'Every week' })).toBeNull();
    expect(getByText('Repeats every Tuesday until December 8')).toBeTruthy();
  });
});

/**
 * The location note is the small thing a board changes at the door. It is a
 * field of its own so that it is never mistaken for the room.
 */
describe('EventForm location note', () => {
  it('offers a field for it, empty by default', () => {
    const { getByLabelText } = setUp();
    expect(getByLabelText(/Location note/).value).toBe('');
  });

  it('starts with the note the event already has', () => {
    const { getByLabelText } = setUp({
      initial: { title: 'Meeting', start_time: '2026-09-01 18:00:00', end_time: '2026-09-01 19:30:00', location_note: 'Use the north entrance.' },
    });
    expect(getByLabelText(/Location note/).value).toBe('Use the north entrance.');
  });

  it('will not take more than the note can hold', () => {
    const { getByLabelText } = setUp();
    expect(getByLabelText(/Location note/).getAttribute('maxlength')).toBe('500');
  });

  it('sends the note back unchanged when the form was filled from a listing row and nothing was touched', async () => {
    // This is how the dashboard edits an event: the row out of the listing is
    // handed to the form as it stands, and the form posts every column back.
    // Anything the listing does not carry is therefore cleared by a save that
    // changed nothing else, which is what happened to the note.
    const listingRow = {
      event_id: 10, rso_id: 1, title: 'General meeting', description: 'Bring a laptop.',
      start_time: '2026-09-01 18:00:00', end_time: '2026-09-01 19:30:00',
      is_private: 0, cancelled_at: null, series_id: null, detached: 0,
      location_id: 5, location_text: null, location_note: 'Use the north entrance.',
      rso_name: 'IEEE', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
      tags: '',
    };
    const submitted = vi.fn();
    const { getByRole } = render(EventForm, {
      props: { rsoId: 1, semester: SEMESTER, initial: listingRow },
      events: { submit: event => submitted(event.detail) },
    });

    await fireEvent.click(getByRole('button', { name: /save|update|create/i }));
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({ location_note: 'Use the north entrance.' }),
    );
  });
});

/**
 * The shapes a repeat can take on the form.
 *
 * It used to be every week or every other week and nothing else, so a board
 * holding a meeting once a month, or on a set of dates that follow no rule,
 * entered each one by hand.
 */
describe('EventForm repeats', () => {
  const filled = async () => {
    const rendered = render(EventForm, { props: { rsoId: 1 } });
    await fireEvent.input(rendered.getByLabelText(/Event Title/i), { target: { value: 'Board meeting' } });
    await fireEvent.input(rendered.getByLabelText(/Start Time/i), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(rendered.getByLabelText(/End Time/i), { target: { value: '2026-09-01T19:30' } });
    return rendered;
  };

  const submitted = async (rendered, onSubmit) => {
    await fireEvent.click(rendered.getByRole('button', { name: /Create event/i }));
    return onSubmit.mock.calls.at(-1)?.[0].detail;
  };

  it('sends a weekly repeat with the interval that was chosen', async () => {
    const onSubmit = vi.fn();
    const rendered = render(EventForm, { props: { rsoId: 1 }, events: { submit: onSubmit } });
    await fireEvent.input(rendered.getByLabelText(/Event Title/i), { target: { value: 'Board meeting' } });
    await fireEvent.input(rendered.getByLabelText(/Start Time/i), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(rendered.getByLabelText(/End Time/i), { target: { value: '2026-09-01T19:30' } });
    await fireEvent.click(rendered.getByRole('button', { name: 'Every week' }));
    await fireEvent.input(rendered.getByLabelText(/every how many weeks/i), { target: { value: '3' } });
    const detail = await submitted(rendered, onSubmit);
    expect(detail.recurrence).toMatchObject({ frequency: 'weekly', interval_weeks: 3 });
  });

  it('sends a monthly repeat on a date in the month', async () => {
    const onSubmit = vi.fn();
    const rendered = render(EventForm, { props: { rsoId: 1 }, events: { submit: onSubmit } });
    await fireEvent.input(rendered.getByLabelText(/Event Title/i), { target: { value: 'Board meeting' } });
    await fireEvent.input(rendered.getByLabelText(/Start Time/i), { target: { value: '2026-09-15T18:00' } });
    await fireEvent.input(rendered.getByLabelText(/End Time/i), { target: { value: '2026-09-15T19:30' } });
    await fireEvent.click(rendered.getByRole('button', { name: 'Every month' }));
    const detail = await submitted(rendered, onSubmit);
    expect(detail.recurrence).toMatchObject({ frequency: 'monthly', interval_months: 1, month_day: 15 });
    expect(detail.recurrence.month_week).toBeUndefined();
  });

  it('sends a monthly repeat on a weekday of the month when that is chosen', async () => {
    const onSubmit = vi.fn();
    const rendered = render(EventForm, { props: { rsoId: 1 }, events: { submit: onSubmit } });
    await fireEvent.input(rendered.getByLabelText(/Event Title/i), { target: { value: 'Board meeting' } });
    await fireEvent.input(rendered.getByLabelText(/Start Time/i), { target: { value: '2026-09-08T18:00' } });
    await fireEvent.input(rendered.getByLabelText(/End Time/i), { target: { value: '2026-09-08T19:30' } });
    await fireEvent.click(rendered.getByRole('button', { name: 'Every month' }));
    await fireEvent.click(rendered.getByRole('button', { name: /On a weekday of the month/i }));
    const detail = await submitted(rendered, onSubmit);
    expect(detail.recurrence).toMatchObject({ frequency: 'monthly', month_week: 2, days_of_week: ['Tue'] });
    expect(detail.recurrence.month_day).toBeUndefined();
  });

  it('sends the dates that were picked one by one', async () => {
    const onSubmit = vi.fn();
    const rendered = render(EventForm, { props: { rsoId: 1 }, events: { submit: onSubmit } });
    await fireEvent.input(rendered.getByLabelText(/Event Title/i), { target: { value: 'Board meeting' } });
    await fireEvent.input(rendered.getByLabelText(/Start Time/i), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(rendered.getByLabelText(/End Time/i), { target: { value: '2026-09-01T19:30' } });
    await fireEvent.click(rendered.getByRole('button', { name: 'On dates I pick' }));
    await fireEvent.click(rendered.getByRole('button', { name: 'September 17, 2026' }));
    await fireEvent.click(rendered.getByRole('button', { name: 'September 24, 2026' }));
    const detail = await submitted(rendered, onSubmit);
    expect(detail.recurrence).toMatchObject({ frequency: 'dates', dates: ['2026-09-17', '2026-09-24'] });
  });

  it('will not create a repeat on no dates at all', async () => {
    const onSubmit = vi.fn();
    const rendered = render(EventForm, { props: { rsoId: 1 }, events: { submit: onSubmit } });
    await fireEvent.input(rendered.getByLabelText(/Event Title/i), { target: { value: 'Board meeting' } });
    await fireEvent.input(rendered.getByLabelText(/Start Time/i), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(rendered.getByLabelText(/End Time/i), { target: { value: '2026-09-01T19:30' } });
    await fireEvent.click(rendered.getByRole('button', { name: 'On dates I pick' }));
    expect(rendered.getByRole('button', { name: /Create event/i }).disabled).toBe(true);
  });

  it('sends no repeat at all when the event does not repeat', async () => {
    const onSubmit = vi.fn();
    const rendered = render(EventForm, { props: { rsoId: 1 }, events: { submit: onSubmit } });
    await fireEvent.input(rendered.getByLabelText(/Event Title/i), { target: { value: 'One off' } });
    await fireEvent.input(rendered.getByLabelText(/Start Time/i), { target: { value: '2026-09-01T18:00' } });
    await fireEvent.input(rendered.getByLabelText(/End Time/i), { target: { value: '2026-09-01T19:30' } });
    const detail = await submitted(rendered, onSubmit);
    expect(detail.recurrence).toBeNull();
  });
});
