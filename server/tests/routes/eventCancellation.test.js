import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const eventsDb = vi.hoisted(() => ({
  getEventById: vi.fn(), updateEvent: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  deleteEvent: vi.fn(), setEventTags: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
  getPublicEvents: vi.fn().mockResolvedValue([]), countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getAllEvents: vi.fn().mockResolvedValue([]), countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getVisibleEvents: vi.fn().mockResolvedValue([]), countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getKioskEvents: vi.fn().mockResolvedValue([]), getEventsByRso: vi.fn().mockResolvedValue([]),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/events.js', () => eventsDb);
const getMembership = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/rso.js', () => ({ getMembership, getUserMemberships: vi.fn().mockResolvedValue([]) }));
vi.mock('../../db/queries/users.js', () => ({ getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn() }));
vi.mock('../../db/queries/eventSeries.js', () => ({ detachEvent: vi.fn(), syncSeriesEnd: vi.fn() }));
vi.mock('../../db/queries/advanced.js', () => ({
  createEventTransactional: vi.fn().mockResolvedValue({ eventId: 42 }), callGetRSOStats: vi.fn(),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');
const { createEventTransactional } = await import('../../db/queries/advanced.js');

const editor = `via_token=${signToken({ net_id: 'ed' })}`;
const EVENT = { event_id: 10, rso_id: 1, title: 'General meeting', series_id: null, cancelled_at: null,
  start_time: '2026-09-10 18:00:00', end_time: '2026-09-10 19:00:00' };

beforeEach(() => {
  eventsDb.updateEvent.mockClear();
  eventsDb.getEventById.mockResolvedValue({ ...EVENT });
  getMembership.mockResolvedValue({ role: 'Editor' });
});

/**
 * Cancelling is a state, not a delete. The event keeps its page, so the
 * people who planned to go can be told, and the board can put it back if the
 * cancellation was the mistake.
 */
describe('POST /api/v1/events/:id/cancel', () => {
  it('marks the event cancelled at the campus time it happened', async () => {
    const res = await request(app).post('/api/v1/events/10/cancel').set('Cookie', editor);
    expect(res.status).toBe(200);
    // Published with the campus offset, like every other time the API answers.
    expect(res.body).toEqual({ ok: true, cancelled_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[56]:00$/) });
    // Stored as the campus wall clock, like every other time the database holds.
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, { cancelled_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/) });
    expect(res.body.cancelled_at.slice(0, 19).replace('T', ' ')).toBe(eventsDb.updateEvent.mock.calls[0][1].cancelled_at);
  });

  it('is an editor action, like every other change to an event', async () => {
    getMembership.mockResolvedValue({ role: 'Member' });
    const res = await request(app).post('/api/v1/events/10/cancel').set('Cookie', editor);
    expect(res.status).toBe(403);
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('needs a signed in person', async () => {
    expect((await request(app).post('/api/v1/events/10/cancel')).status).toBe(401);
  });

  it('answers 404 for an event that does not exist', async () => {
    eventsDb.getEventById.mockResolvedValue(null);
    expect((await request(app).post('/api/v1/events/99/cancel').set('Cookie', editor)).status).toBe(404);
  });

  it('leaves an already cancelled event as it was', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, cancelled_at: '2026-09-01 08:00:00' });
    const res = await request(app).post('/api/v1/events/10/cancel').set('Cookie', editor);
    expect(res.status).toBe(200);
    expect(res.body.cancelled_at).toContain('2026-09-01T08:00:00');
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/events/:id/restore', () => {
  it('puts a cancelled event back', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, cancelled_at: '2026-09-01 08:00:00' });
    const res = await request(app).post('/api/v1/events/10/restore').set('Cookie', editor);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cancelled_at: null });
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, { cancelled_at: null });
  });

  it('is an editor action too', async () => {
    getMembership.mockResolvedValue({ role: 'Member' });
    expect((await request(app).post('/api/v1/events/10/restore').set('Cookie', editor)).status).toBe(403);
  });
});

/**
 * The location note is the small thing a board changes at the door. It is
 * stored trimmed, an empty note is no note, and it has the column's width.
 */
describe('the location note', () => {
  it('is saved with an edit, trimmed', async () => {
    const res = await request(app).put('/api/v1/events/10').set('Cookie', editor)
      .send({ title: 'General meeting', location_note: '  Use the north entrance.  ' });
    expect(res.status).toBe(200);
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, expect.objectContaining({ location_note: 'Use the north entrance.' }));
  });

  it('is cleared by an empty note', async () => {
    await request(app).put('/api/v1/events/10').set('Cookie', editor).send({ location_note: '   ' });
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(10, expect.objectContaining({ location_note: null }));
  });

  it('is left alone by an edit that does not mention it', async () => {
    await request(app).put('/api/v1/events/10').set('Cookie', editor).send({ title: 'Renamed' });
    const [, updates] = eventsDb.updateEvent.mock.calls[0];
    expect('location_note' in updates).toBe(false);
  });

  it('is refused when it is longer than the column', async () => {
    const res = await request(app).put('/api/v1/events/10').set('Cookie', editor)
      .send({ location_note: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/500/);
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('is saved with a new event', async () => {
    await request(app).post('/api/v1/events').set('Cookie', editor)
      .send({ rso_id: 1, title: 'New', start_time: '2026-09-10 18:00:00', end_time: '2026-09-10 19:00:00',
              location_note: 'Ask at the front desk.' });
    expect(createEventTransactional.mock.calls.at(-1)[0]).toMatchObject({ location_note: 'Ask at the front desk.' });
  });
});
