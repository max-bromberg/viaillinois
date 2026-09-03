import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getPublicEvents = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const countPublicEvents = vi.hoisted(() => vi.fn().mockResolvedValue([{ total: 0 }]));
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents, countPublicEvents,
  getAllEvents: vi.fn().mockResolvedValue([]), countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getVisibleEvents: vi.fn().mockResolvedValue([]), countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getKioskEvents: vi.fn().mockResolvedValue([]), getEventsByRso: vi.fn().mockResolvedValue([]),
  getEventById: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(),
  findEventsByUid: vi.fn(), createEvent: vi.fn(),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;

beforeEach(() => { getPublicEvents.mockClear(); countPublicEvents.mockClear(); });

/**
 * The feed's filter panel is answered by the database now, so the page a reader
 * asked for is the page the query builds. These assert the wiring: that both
 * filters reach the query, that the count sees the same ones the list does, and
 * that a caller cannot send something through them that is not an RSO number.
 */
describe('GET /api/v1/events with the panel filters', () => {
  it('passes the chosen RSOs to the query', async () => {
    await request(app).get('/api/v1/events?rsoIds=1,3');
    expect(getPublicEvents).toHaveBeenCalledWith(expect.objectContaining({ rsoIds: [1, 3] }));
  });

  it('counts against the same filter it lists against', async () => {
    await request(app).get('/api/v1/events?rsoIds=1,3');
    expect(countPublicEvents).toHaveBeenCalledWith(expect.objectContaining({ rsoIds: [1, 3] }));
  });

  it('accepts the RSOs repeated as separate parameters too', async () => {
    await request(app).get('/api/v1/events?rsoIds=1&rsoIds=3');
    expect(getPublicEvents).toHaveBeenCalledWith(expect.objectContaining({ rsoIds: [1, 3] }));
  });

  it('carries the request to leave out private events', async () => {
    await request(app).get('/api/v1/events?excludePrivate=true');
    expect(getPublicEvents).toHaveBeenCalledWith(expect.objectContaining({ excludePrivate: true }));
  });

  it('treats no selection as no filter', async () => {
    await request(app).get('/api/v1/events');
    expect(getPublicEvents).toHaveBeenCalledWith(expect.objectContaining({ rsoIds: [], excludePrivate: false }));
  });

  it('refuses an RSO that is not a number rather than passing it to the query', async () => {
    const res = await request(app).get('/api/v1/events?rsoIds=1,abc');
    expect(res.status).toBe(400);
    expect(getPublicEvents).not.toHaveBeenCalled();
  });

  it('refuses more RSOs than the platform could ever have', async () => {
    const many = Array.from({ length: 501 }, (_, i) => i + 1).join(',');
    const res = await request(app).get(`/api/v1/events?rsoIds=${many}`);
    expect(res.status).toBe(400);
    expect(getPublicEvents).not.toHaveBeenCalled();
  });
});
