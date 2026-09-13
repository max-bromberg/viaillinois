import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { organizationColor } from '../../src/lib/organizationColor.js';
import { campusTodayMarker } from '../../src/lib/campusTime.js';

const getEvents = vi.hoisted(() => vi.fn());
const getRsos = vi.hoisted(() => vi.fn());
const getConfirmedMidterms = vi.hoisted(() => vi.fn());
const navigate = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ getEvents }));
vi.mock('../../src/api/midterms.js', () => ({ getConfirmedMidterms }));
vi.mock('../../src/api/rsos.js', () => ({ getRsos }));
vi.mock('../../src/lib/router.js', () => ({ navigate }));

const Calendar = (await import('../../src/routes/Calendar.svelte')).default;

/** A day in the month the calendar opens on, so an entry lands in a cell. */
const today = campusTodayMarker();
const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;

const IEEE = { rso_id: 1, name: 'IEEE', logo_color: '#00629B' };

const oneEvent = {
  event_id: 1,
  title: 'Intro to PCB Design Workshop',
  rso_name: 'IEEE',
  is_private: false,
  start_time: `${day} 18:00:00`,
  end_time: `${day} 20:00:00`,
};

beforeEach(() => {
  getEvents.mockReset();
  getEvents.mockResolvedValue({ events: [], total: 0 });
  getRsos.mockReset();
  getRsos.mockResolvedValue({ rsos: [] });
  getConfirmedMidterms.mockReset();
  getConfirmedMidterms.mockResolvedValue({ midterms: [] });
  navigate.mockReset();
});

/**
 * The calendar is not a feed. A reader can page back to last month, and the
 * events that were on then have to still be there, so it asks for the whole
 * calendar and lets its own date range decide what it draws.
 */
describe('Calendar', () => {
  it('asks for events from the whole calendar, not only the ones still to come', async () => {
    render(Calendar);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    expect(getEvents.mock.calls[0][0].timeframe).toBe('all');
  });

  it('still bounds the request to the week it is showing', async () => {
    render(Calendar);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    const filters = getEvents.mock.calls[0][0];
    expect(filters.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(filters.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * The month grid.
 *
 * Three things were wrong with it, and together they are why boards reported
 * that events went missing from the last week of some months. The grid stopped
 * at the last day of the month, so the final row was a short row of cells with
 * empty space beside it rather than a week. The request it made asked for the
 * month by its two dates, which on the server excluded everything on the last
 * of them. And a day with more than three entries hid the rest behind a count
 * that could not be opened, which is what an imported term of events looks
 * like.
 */
describe('Calendar month view', () => {
  it('opens on the month, which is the view boards read the calendar in', async () => {
    const { getByRole } = render(Calendar);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    const filters = getEvents.mock.calls[0][0];
    expect(filters.startDate).toMatch(/^\d{4}-\d{2}-01$/);
    expect(getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('fills the last week of the grid, so every row is a whole week', async () => {
    const { container } = render(Calendar);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    const cells = container.querySelectorAll('[data-month-cell]');
    expect(cells.length).toBeGreaterThan(27);
    expect(cells.length % 7).toBe(0);
  });

  it('opens a day that holds more entries than the cell shows', async () => {
    getEvents.mockResolvedValue({
      total: 5,
      events: Array.from({ length: 5 }, (_, i) => ({
        event_id: i + 1,
        title: `Imported event ${i + 1}`,
        rso_name: 'ECESAC',
        is_private: false,
        start_time: `${day} 1${i}:00:00`,
        end_time: `${day} 1${i}:30:00`,
      })),
    });
    const { findByText, getByText, queryByText } = render(Calendar);
    const more = await findByText('+2 more');
    expect(queryByText('Imported event 5')).toBeNull();
    await fireEvent.click(more);
    await waitFor(() => expect(getByText('Imported event 5')).toBeTruthy());
  });

  it('opens the event when its entry is chosen', async () => {
    getEvents.mockResolvedValue({ total: 1, events: [oneEvent] });
    const { findByText } = render(Calendar);
    await fireEvent.click(await findByText('Intro to PCB Design Workshop'));
    expect(navigate).toHaveBeenCalledWith('/events/1');
  });
});

/**
 * The calendar under the design system.
 *
 * docs/design/08-surfaces.md: entries are the organization's adapted mark
 * colour as a 2 px trace on the left of the entry's text, which is the one
 * place a vertical colour line remains, because a calendar cell is too small
 * for a lamp. Midterms use plum. There is no legend of coloured squares,
 * because the filter rail's pads and names are the legend.
 */
describe('Calendar entries', () => {
  it('traces an entry in the organization’s adapted colour, never the stored one', async () => {
    getRsos.mockResolvedValue({ rsos: [IEEE] });
    getEvents.mockResolvedValue({ total: 1, events: [oneEvent] });
    const { findByText } = render(Calendar);
    const entry = (await findByText('Intro to PCB Design Workshop')).closest('.entry');

    const style = entry.getAttribute('style');
    expect(style).toContain(organizationColor(IEEE.logo_color, 'mark', 'light'));
    expect(style).not.toContain(IEEE.logo_color);
  });

  it('traces a midterm in plum, and spends no emoji on it', async () => {
    getConfirmedMidterms.mockResolvedValue({
      midterms: [{
        midterm_id: 2, course_code: 'ECE 210', title: 'Midterm 1',
        start_time: `${day} 19:00:00`, end_time: `${day} 21:00:00`,
      }],
    });
    const { findByText, container } = render(Calendar);
    const entry = (await findByText('ECE 210')).closest('.entry');
    expect(entry.getAttribute('style')).toContain('var(--plum)');
    expect(container.textContent).not.toContain('\u{1F4DD}');
  });

  it('keeps no legend of coloured squares, because the rail is the legend', async () => {
    const { container } = render(Calendar);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    expect(container.textContent).not.toContain('Public event');
    expect(container.textContent).not.toContain('Midterm legend');
    // A legend square is the one thing on the old calendar that carried a
    // colour of its own with no name beside it.
    expect(container.querySelector('[style*="background-color"]')).toBeNull();
  });

  it('sets today’s day number in signal, and every other in ink', async () => {
    const { container } = render(Calendar);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());
    const marked = container.querySelectorAll('.daynum.today');
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent.trim()).toBe(String(today.getDate()));
  });
});

/**
 * The filter rail.
 *
 * It is words rather than a panel now, and every control on it is a different
 * element than it was, so what matters is that each one still reaches the grid
 * and the request behind it.
 */
describe('Calendar filter rail', () => {
  it('asks again with the keyword somebody typed', async () => {
    const { getByLabelText } = render(Calendar);
    await waitFor(() => expect(getEvents).toHaveBeenCalled());

    await fireEvent.input(getByLabelText('Search'), { target: { value: 'PCB' } });
    await waitFor(() => expect(getEvents.mock.calls.at(-1)[0].keyword).toBe('PCB'));
  });

  it('takes the midterms off the grid when they are turned off', async () => {
    getConfirmedMidterms.mockResolvedValue({
      midterms: [{
        midterm_id: 2, course_code: 'ECE 210', title: 'Midterm 1',
        start_time: `${day} 19:00:00`, end_time: `${day} 21:00:00`,
      }],
    });
    const { findByText, getByRole, queryByText } = render(Calendar);
    await findByText('ECE 210');

    const control = getByRole('button', { name: 'Midterms' });
    expect(control.getAttribute('aria-pressed')).toBe('true');
    await fireEvent.click(control);
    await waitFor(() => expect(queryByText('ECE 210')).toBeNull());
  });

  it('narrows the grid to the organizations that are chosen', async () => {
    getRsos.mockResolvedValue({ rsos: [IEEE, { rso_id: 2, name: 'HKN', logo_color: '#8B1E3F' }] });
    getEvents.mockResolvedValue({
      total: 2,
      events: [
        oneEvent,
        { ...oneEvent, event_id: 2, title: 'Fall General Meeting', rso_name: 'HKN' },
      ],
    });
    const { findByRole, getByText, queryByText } = render(Calendar);
    await fireEvent.click(await findByRole('button', { name: 'HKN' }));

    await waitFor(() => expect(queryByText('Intro to PCB Design Workshop')).toBeNull());
    expect(getByText('Fall General Meeting')).toBeTruthy();
  });
});
