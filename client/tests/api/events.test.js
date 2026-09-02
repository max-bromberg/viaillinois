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
