import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';

const getEvents = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/events.js', () => ({ getEvents }));
vi.mock('../../src/api/midterms.js', () => ({ getConfirmedMidterms: vi.fn().mockResolvedValue({ midterms: [] }) }));
vi.mock('../../src/api/rsos.js', () => ({ getRsos: vi.fn().mockResolvedValue({ rsos: [] }) }));
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn() }));

const Calendar = (await import('../../src/routes/Calendar.svelte')).default;

beforeEach(() => {
  getEvents.mockReset();
  getEvents.mockResolvedValue({ events: [], total: 0 });
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
    const day = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-15`;
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
});
