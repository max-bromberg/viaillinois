import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiFetch = vi.hoisted(() => vi.fn().mockResolvedValue({ events: [], total: 0 }));
vi.mock('../../src/api/base.js', () => ({ apiFetch }));

const eventsApi = await import('../../src/api/events.js');
const { getEvents } = eventsApi;

/** The query string the last request carried. */
function lastQuery() {
  return new URLSearchParams(apiFetch.mock.calls.at(-1)[0].split('?')[1]);
}

beforeEach(() => apiFetch.mockClear());

describe('getEvents', () => {
  it('asks the server for the timeframe it was given', async () => {
    await getEvents({ timeframe: 'archived' });
    expect(lastQuery().get('timeframe')).toBe('archived');
  });

  it('leaves the timeframe to the server when the caller names none', async () => {
    await getEvents({ keyword: 'robotics' });
    expect(lastQuery().has('timeframe')).toBe(false);
    expect(lastQuery().get('keyword')).toBe('robotics');
  });

  it('carries the timeframe alongside the other filters', async () => {
    await getEvents({ timeframe: 'upcoming', tags: ['Free Food'], limit: 18, offset: 18 });
    const params = lastQuery();
    expect(params.get('timeframe')).toBe('upcoming');
    expect(params.getAll('tags')).toEqual(['Free Food']);
    expect(params.get('limit')).toBe('18');
    expect(params.get('offset')).toBe('18');
  });
});

describe('the RSVP calls, which were removed', () => {
  it('are not offered, so nothing can reach an endpoint that is gone', () => {
    expect(eventsApi.rsvpEvent).toBeUndefined();
    expect(eventsApi.getEventRsvps).toBeUndefined();
  });
});

/**
 * A repeat is created in one request, and an edit or a deletion has to say how
 * much of a series it means.
 */
describe('the calls a repeating event needs', () => {
  it('creates a series in one request', async () => {
    await eventsApi.createEventSeries({
      rso_id: 1, title: 'Weekly meeting',
      recurrence: { interval_weeks: 1, days_of_week: ['Tue'], ends_on: '2026-12-08' },
    });
    const [path, options] = apiFetch.mock.calls.at(-1);
    expect(path).toBe('/api/v1/events/series');
    expect(options.method).toBe('POST');
    expect(options.body.recurrence.days_of_week).toEqual(['Tue']);
  });

  it('says which weeks an edit is for', async () => {
    await eventsApi.updateEvent(5, { title: 'Moved' }, 'following');
    expect(apiFetch.mock.calls.at(-1)[0]).toBe('/api/v1/events/5?scope=following');
  });

  it('says which weeks a deletion is for', async () => {
    await eventsApi.deleteEvent(5, 'all');
    expect(apiFetch.mock.calls.at(-1)[0]).toBe('/api/v1/events/5?scope=all');
  });

  it('leaves the scope out when it means this event alone', async () => {
    await eventsApi.updateEvent(5, { title: 'Moved' });
    expect(apiFetch.mock.calls.at(-1)[0]).toBe('/api/v1/events/5');
    await eventsApi.deleteEvent(5);
    expect(apiFetch.mock.calls.at(-1)[0]).toBe('/api/v1/events/5');
  });
});
