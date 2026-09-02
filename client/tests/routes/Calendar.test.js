import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';

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
