import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getPublicEvents = vi.fn().mockResolvedValue([]);
const countPublicEvents = vi.fn().mockResolvedValue([{ total: 0 }]);
const getKioskEvents = vi.fn().mockResolvedValue([]);

vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents:   (...a) => getPublicEvents(...a),
  countPublicEvents: (...a) => countPublicEvents(...a),
  getKioskEvents:    (...a) => getKioskEvents(...a),
  getAllEvents: vi.fn().mockResolvedValue([]), countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getVisibleEvents: vi.fn().mockResolvedValue([]), countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getEventsByRso: vi.fn().mockResolvedValue([]), getEventById: vi.fn(),
  updateEvent: vi.fn(), deleteEvent: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));

const app = (await import('../../app.js')).default;

beforeEach(() => {
  getPublicEvents.mockClear();
  getKioskEvents.mockClear();
});

/**
 * Before this, GET /api/v1/events?limit=999999999 was accepted and reached the
 * database as written, and ?limit=abc reached it as LIMIT NaN and came back as
 * a 500. Capping the depth of paging is also what makes the public budgets
 * mean anything: a client that cannot ask for everything at once has to ask
 * many times, and many times is what a budget can count.
 */
describe('list endpoints bound what one request may ask for', () => {
  it('clamps an enormous event limit to the route ceiling', async () => {
    const res = await request(app).get('/api/v1/events?limit=999999999');
    expect(res.status).toBe(200);
    expect(getPublicEvents.mock.calls[0][0].limit).toBe(100);
  });

  it('refuses an event limit that is not a number, rather than failing in the database', async () => {
    const res = await request(app).get('/api/v1/events?limit=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('limit and offset must be whole numbers of zero or more.');
    expect(getPublicEvents).not.toHaveBeenCalled();
  });

  it('refuses paging deeper than the events route allows', async () => {
    const res = await request(app).get('/api/v1/events?offset=5001');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('That page is too far into the results. Please narrow the range by date.');
  });

  it('still serves an ordinary page', async () => {
    const res = await request(app).get('/api/v1/events?limit=25&offset=50');
    expect(res.status).toBe(200);
    expect(getPublicEvents.mock.calls[0][0]).toMatchObject({ limit: 25, offset: 50 });
  });

  it('clamps the kiosk to its own smaller ceiling', async () => {
    await request(app).get('/api/v1/kiosk/events?limit=5000');
    expect(getKioskEvents).toHaveBeenCalledWith(50);
  });
});
