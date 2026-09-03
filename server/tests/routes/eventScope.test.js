import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([]), getAllEvents: vi.fn().mockResolvedValue([]),
  getVisibleEvents: vi.fn().mockResolvedValue([]),
  getEventById: vi.fn(), updateEvent: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  deleteEvent: vi.fn().mockResolvedValue({ affectedRows: 1 }), setEventTags: vi.fn(),
  createEvent: vi.fn(), findEventsByUid: vi.fn().mockResolvedValue([]),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/eventSeries.js', () => ({
  busyInRoom: vi.fn().mockResolvedValue([]),
  createSeriesWithOccurrences: vi.fn(),
  getSeriesById: vi.fn(), occurrencesOfSeries: vi.fn().mockResolvedValue([]),
  detachEvent: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  applyToSeries: vi.fn().mockResolvedValue({ affectedRows: 3 }),
  setTagsForEvents: vi.fn(),
  deleteOccurrencesFrom: vi.fn().mockResolvedValue({ affectedRows: 2, remaining: 1 }),
  deleteSeries: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  syncSeriesEnd: vi.fn(), findSeriesByUid: vi.fn(), updateSeriesRule: vi.fn(),
}));
vi.mock('../../services/conflictDetector.js', () => ({ checkConflict: vi.fn().mockResolvedValue(false) }));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn().mockResolvedValue({ role: 'Board' }),
  getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');
const eventsDb = await import('../../db/queries/events.js');
const seriesDb = await import('../../db/queries/eventSeries.js');
const { checkConflict } = await import('../../services/conflictDetector.js');

const cookie = `via_token=${signToken({ net_id: 'boardmember' })}`;

const OCCURRENCE = {
  event_id: 5, rso_id: 1, series_id: 3, detached: 0,
  title: 'IEEE Weekly Meeting', start_time: '2026-09-15 18:00:00', end_time: '2026-09-15 19:30:00',
};
const ONE_OFF = { event_id: 8, rso_id: 1, series_id: null, detached: 0, title: 'Career fair' };

const EDIT = {
  title: 'Moved to seven',
  start_time: '2026-09-15 19:00:00',
  end_time: '2026-09-15 20:00:00',
};

const put = (id, query, body) =>
  request(app).put(`/api/v1/events/${id}${query}`).set('Cookie', cookie).send(body);
const del = (id, query) =>
  request(app).delete(`/api/v1/events/${id}${query}`).set('Cookie', cookie);

beforeEach(() => {
  vi.clearAllMocks();
  eventsDb.getEventById.mockResolvedValue(OCCURRENCE);
  eventsDb.updateEvent.mockResolvedValue({ affectedRows: 1 });
  eventsDb.deleteEvent.mockResolvedValue({ affectedRows: 1 });
  seriesDb.applyToSeries.mockResolvedValue({ affectedRows: 3 });
  seriesDb.deleteOccurrencesFrom.mockResolvedValue({ affectedRows: 2, remaining: 1 });
  seriesDb.occurrencesOfSeries.mockResolvedValue([]);
  seriesDb.busyInRoom.mockResolvedValue([]);
  checkConflict.mockResolvedValue(false);
});

/**
 * Moving one week of a weekly meeting and moving the meeting are different
 * things, so the request has to say which it means.
 */
describe('PUT /api/v1/events/:id with a scope', () => {
  it('changes only this week, and marks it as changed on its own', async () => {
    const res = await put(5, '', EDIT);
    expect(res.status).toBe(200);
    expect(eventsDb.updateEvent).toHaveBeenCalledWith(5, expect.objectContaining({ title: 'Moved to seven' }));
    expect(seriesDb.detachEvent).toHaveBeenCalledWith(5);
    expect(seriesDb.applyToSeries).not.toHaveBeenCalled();
  });

  it('changes this week and the later ones', async () => {
    const res = await put(5, '?scope=following', EDIT);
    expect(res.status).toBe(200);
    expect(seriesDb.applyToSeries).toHaveBeenCalledWith(3, expect.objectContaining({
      from: '2026-09-15 18:00:00', startOfDay: '19:00:00', durationMinutes: 60,
    }));
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  it('changes every week of the series', async () => {
    const res = await put(5, '?scope=all', EDIT);
    expect(res.status).toBe(200);
    expect(seriesDb.applyToSeries).toHaveBeenCalledWith(3, expect.objectContaining({
      from: null, startOfDay: '19:00:00', durationMinutes: 60,
    }));
  });

  /**
   * The edit form posts what a browser date and time field holds, with a T and
   * no seconds. Read as a stored wall clock reading, that moved every week of
   * the series to midnight and gave it a length that was not a number.
   */
  it('moves the whole series when the form posts a browser date and time field', async () => {
    const res = await put(5, '?scope=all', {
      ...EDIT, start_time: '2026-09-15T19:00', end_time: '2026-09-15T20:00',
    });
    expect(res.status).toBe(200);
    expect(seriesDb.applyToSeries).toHaveBeenCalledWith(3, expect.objectContaining({
      startOfDay: '19:00:00', durationMinutes: 60,
    }));
  });

  it('refuses times it cannot read rather than moving the series to midnight', async () => {
    const res = await put(5, '?scope=all', {
      ...EDIT, start_time: 'half past seven', end_time: 'half past eight',
    });
    expect(res.status).toBe(400);
    expect(seriesDb.applyToSeries).not.toHaveBeenCalled();
  });

  it('carries the fields that are not times into the whole series', async () => {
    await put(5, '?scope=all', { ...EDIT, description: 'New room this term', is_private: true });
    const [, options] = seriesDb.applyToSeries.mock.calls[0];
    expect(options.fields).toMatchObject({
      title: 'Moved to seven', description: 'New room this term', is_private: true,
    });
  });

  it('retags the occurrences an edit covers, and leaves the detached ones alone', async () => {
    seriesDb.occurrencesOfSeries.mockResolvedValue([
      { event_id: 5, start_time: '2026-09-15 18:00:00', end_time: '2026-09-15 19:30:00', detached: 0 },
      { event_id: 6, start_time: '2026-09-22 18:00:00', end_time: '2026-09-22 19:30:00', detached: 1 },
      { event_id: 7, start_time: '2026-09-29 18:00:00', end_time: '2026-09-29 19:30:00', detached: 0 },
    ]);
    await put(5, '?scope=all', { ...EDIT, tags: ['Workshop'] });
    expect(seriesDb.setTagsForEvents).toHaveBeenCalledWith([5, 7], ['Workshop']);
  });

  it('treats an event that does not repeat as a single event, whatever scope it is sent', async () => {
    eventsDb.getEventById.mockResolvedValue(ONE_OFF);
    const res = await put(8, '?scope=all', EDIT);
    expect(res.status).toBe(200);
    expect(eventsDb.updateEvent).toHaveBeenCalled();
    expect(seriesDb.applyToSeries).not.toHaveBeenCalled();
    expect(seriesDb.detachEvent).not.toHaveBeenCalled();
  });

  it('rejects a scope it does not recognise', async () => {
    const res = await put(5, '?scope=everything', EDIT);
    expect(res.status).toBe(400);
    expect(eventsDb.updateEvent).not.toHaveBeenCalled();
  });

  /**
   * The single event conflict check called a helper this module never
   * imported, so editing any event that had a room threw instead of
   * answering.
   */
  it('checks the room for a single edit, and says when it is taken', async () => {
    const res = await put(5, '', { ...EDIT, location_id: 7 });
    expect(res.status).toBe(200);
    expect(checkConflict).toHaveBeenCalledWith(7, EDIT.start_time, EDIT.end_time, 5);

    checkConflict.mockResolvedValue(true);
    expect((await put(5, '', { ...EDIT, location_id: 7 })).status).toBe(409);
  });

  /**
   * Moving a whole series into a room somebody else has booked cannot quietly
   * skip those weeks: the events already exist, so the answer is no.
   */
  it('refuses to move a series into weeks the room is taken, and names them', async () => {
    seriesDb.occurrencesOfSeries.mockResolvedValue([
      { event_id: 5, start_time: '2026-09-15 18:00:00', end_time: '2026-09-15 19:30:00', detached: 0 },
      { event_id: 6, start_time: '2026-09-22 18:00:00', end_time: '2026-09-22 19:30:00', detached: 0 },
    ]);
    seriesDb.busyInRoom.mockResolvedValue([
      { start_time: '2026-09-22 19:00:00', end_time: '2026-09-22 21:00:00' },
    ]);
    const res = await put(5, '?scope=all', { ...EDIT, location_id: 7 });
    expect(res.status).toBe(409);
    expect(res.body.conflicts).toEqual(['2026-09-22']);
    expect(seriesDb.applyToSeries).not.toHaveBeenCalled();
  });

  it('does not count the series own weeks against itself', async () => {
    seriesDb.occurrencesOfSeries.mockResolvedValue([
      { event_id: 5, start_time: '2026-09-15 18:00:00', end_time: '2026-09-15 19:30:00', detached: 0 },
    ]);
    await put(5, '?scope=all', { ...EDIT, location_id: 7 });
    expect(seriesDb.busyInRoom).toHaveBeenCalledWith(7, expect.any(String), expect.any(String), { excludeSeriesId: 3 });
  });
});

describe('DELETE /api/v1/events/:id with a scope', () => {
  it('deletes only this week', async () => {
    const res = await del(5, '');
    expect(res.status).toBe(200);
    expect(eventsDb.deleteEvent).toHaveBeenCalledWith(5);
    expect(seriesDb.deleteSeries).not.toHaveBeenCalled();
  });

  it('ends the series where the deletion begins', async () => {
    const res = await del(5, '?scope=following');
    expect(res.status).toBe(200);
    expect(seriesDb.deleteOccurrencesFrom).toHaveBeenCalledWith(3, '2026-09-15 18:00:00');
    expect(res.body.deleted).toBe(2);
  });

  it('deletes the whole series', async () => {
    const res = await del(5, '?scope=all');
    expect(res.status).toBe(200);
    expect(seriesDb.deleteSeries).toHaveBeenCalledWith(3);
  });

  it('keeps the rule honest when the week it deletes was the last one', async () => {
    await del(5, '');
    expect(seriesDb.syncSeriesEnd).toHaveBeenCalledWith(3);
  });

  it('rejects a scope it does not recognise', async () => {
    expect((await del(5, '?scope=everything')).status).toBe(400);
  });
});
