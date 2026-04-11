import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock all query modules before importing app
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([
    { event_id: 1, title: 'Test Event', start_time: '2026-04-01 18:00:00', tags: 'Free Food' }
  ]),
  getEventById:   vi.fn().mockResolvedValue({ event_id: 1, title: 'Test Event' }),
  createEvent:    vi.fn().mockResolvedValue({ insertId: 42 }),
  updateEvent:    vi.fn().mockResolvedValue({ affectedRows: 1 }),
  deleteEvent:    vi.fn().mockResolvedValue({ affectedRows: 1 }),
  upsertRsvp:     vi.fn().mockResolvedValue(undefined),
  setEventTags:   vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../db/queries/rso.js',   () => ({ getMembership: vi.fn().mockResolvedValue({ role: 'Admin' }) }));
vi.mock('../../db/queries/users.js', () => ({ getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn() }));
vi.mock('../../services/conflictDetector.js', () => ({ checkConflict: vi.fn().mockResolvedValue(false) }));

const app = (await import('../../app.js')).default;

describe('GET /api/v1/events', () => {
  it('returns 200 with events array', async () => {
    const res = await request(app).get('/api/v1/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events[0].title).toBe('Test Event');
  });
});

describe('GET /api/v1/events/:id', () => {
  it('returns 200 with event object', async () => {
    const res = await request(app).get('/api/v1/events/1');
    expect(res.status).toBe(200);
    expect(res.body.event.event_id).toBe(1);
  });

  it('returns 404 when event not found', async () => {
    const { getEventById } = await import('../../db/queries/events.js');
    getEventById.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/v1/events/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/events', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/events').send({ title: 'New' });
    expect(res.status).toBe(401);
  });
});
