import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock all query modules before importing app
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents:    vi.fn().mockResolvedValue([
    { event_id: 1, title: 'Test Event', start_time: '2026-04-01 18:00:00', tags: 'Free Food' }
  ]),
  getEventById:       vi.fn().mockResolvedValue({ event_id: 1, title: 'Test Event' }),
  updateEvent:        vi.fn().mockResolvedValue({ affectedRows: 1 }),
  deleteEvent:        vi.fn().mockResolvedValue({ affectedRows: 1 }),
  upsertRsvp:         vi.fn().mockResolvedValue(undefined),
  countPublicEvents:  vi.fn().mockResolvedValue([{ total: 1 }]),
  countAllEvents:     vi.fn().mockResolvedValue([{ total: 1 }]),
  getEventRsvpCounts: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/advanced.js', () => ({
  createEventTransactional: vi.fn().mockResolvedValue({ eventId: 42 }),
  callGetRSOStats: vi.fn(),
}));
vi.mock('../../db/queries/rso.js',   () => ({
  getMembership:     vi.fn().mockResolvedValue({ role: 'Admin' }),
  getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({ getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn() }));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');
const { createEventTransactional } = await import('../../db/queries/advanced.js');

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
  const cookie = `via_token=${signToken({ net_id: 'tester', is_global_admin: 1 })}`;

  const body = {
    rso_id: 1,
    title: 'New',
    start_time: '2027-04-01 18:00:00',
    end_time: '2027-04-01 19:00:00',
  };

  const post = payload =>
    request(app).post('/api/v1/events').set('Cookie', cookie).send(payload);

  beforeEach(() => {
    createEventTransactional.mockClear();
    createEventTransactional.mockResolvedValue({ eventId: 42 });
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).post('/api/v1/events').send({ title: 'New' });
    expect(res.status).toBe(401);
  });

  it('creates an event in a known room', async () => {
    const res = await post({ ...body, location_id: 7 });
    expect(res.status).toBe(201);
    expect(createEventTransactional.mock.calls[0][0]).toMatchObject({ location_id: 7 });
  });

  /**
   * A location is optional. These two are the cases that the venue finder made
   * impossible to express: somewhere that is not a room, and not knowing yet.
   */
  it('creates an event whose location is free text', async () => {
    const res = await post({ ...body, location_text: 'Zoom' });
    expect(res.status).toBe(201);
    expect(createEventTransactional.mock.calls[0][0]).toMatchObject({
      location_id: null,
      location_text: 'Zoom',
    });
  });

  it('creates an event with no location at all', async () => {
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(createEventTransactional.mock.calls[0][0]).toMatchObject({
      location_id: null,
      location_text: null,
    });
  });

  it('trims free text and treats an empty string as no location', async () => {
    const res = await post({ ...body, location_text: '   ' });
    expect(res.status).toBe(201);
    expect(createEventTransactional.mock.calls[0][0]).toMatchObject({ location_text: null });
  });

  it('still requires a title', async () => {
    const res = await post({ ...body, title: undefined });
    expect(res.status).toBe(400);
  });

  it('still requires an RSO and a time range', async () => {
    expect((await post({ ...body, rso_id: undefined })).status).toBe(400);
    expect((await post({ ...body, start_time: undefined })).status).toBe(400);
    expect((await post({ ...body, end_time: undefined })).status).toBe(400);
  });

  it('reports a booking conflict', async () => {
    createEventTransactional.mockResolvedValue({ conflict: true });
    expect((await post({ ...body, location_id: 7 })).status).toBe(409);
  });

  it('reports missing RSO permission', async () => {
    createEventTransactional.mockResolvedValue({ unauthorized: true });
    expect((await post(body)).status).toBe(403);
  });
});
