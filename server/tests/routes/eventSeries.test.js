import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([]), getAllEvents: vi.fn().mockResolvedValue([]),
  getVisibleEvents: vi.fn().mockResolvedValue([]), getEventById: vi.fn(),
  createEvent: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), setEventTags: vi.fn(),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  findEventsByUid: vi.fn().mockResolvedValue([]),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/eventSeries.js', () => ({
  busyInRoom: vi.fn().mockResolvedValue([]),
  createSeriesWithOccurrences: vi.fn().mockResolvedValue({ seriesId: 9, eventIds: [1, 2, 3] }),
  getSeriesById: vi.fn(), occurrencesOfSeries: vi.fn(), detachEvent: vi.fn(),
  applyToSeries: vi.fn(), setTagsForEvents: vi.fn(),
  deleteOccurrencesFrom: vi.fn(), deleteSeries: vi.fn(),
  findSeriesByUid: vi.fn(), updateSeriesRule: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn().mockResolvedValue({ role: 'Board' }),
  getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');
const seriesDb = await import('../../db/queries/eventSeries.js');
const { getMembership } = await import('../../db/queries/rso.js');

const cookie = `via_token=${signToken({ net_id: 'boardmember' })}`;

const BODY = {
  rso_id: 1,
  title: 'IEEE Weekly Meeting',
  description: 'Every week in term.',
  start_time: '2026-09-01 18:00:00',
  end_time: '2026-09-01 19:30:00',
  recurrence: { days_of_week: ['Tue'], ends_on: '2026-09-29' },
  tags: ['Weekly Meeting'],
};

const post = body => request(app).post('/api/v1/events/series').set('Cookie', cookie).send(body);

beforeEach(() => {
  vi.clearAllMocks();
  getMembership.mockResolvedValue({ role: 'Board' });
  seriesDb.busyInRoom.mockResolvedValue([]);
  seriesDb.createSeriesWithOccurrences.mockResolvedValue({ seriesId: 9, eventIds: [1, 2, 3, 4, 5] });
});

/**
 * A term of weekly meetings is one request. Entering it as fifteen events is
 * what boards were doing instead, and it is why the feed went stale.
 */
describe('POST /api/v1/events/series', () => {
  it('creates the series and every occurrence of it', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(201);
    expect(res.body.series_id).toBe(9);
    expect(res.body.created).toBe(5);

    const [call] = seriesDb.createSeriesWithOccurrences.mock.calls;
    expect(call[0].occurrences.map(o => o.start)).toEqual([
      '2026-09-01 18:00:00', '2026-09-08 18:00:00', '2026-09-15 18:00:00',
      '2026-09-22 18:00:00', '2026-09-29 18:00:00',
    ]);
    expect(call[0].series).toMatchObject({
      rso_id: 1, created_by: 'boardmember', days_of_week: 'Tue', interval_weeks: 1,
    });
    expect(call[0].tagNames).toEqual(['Weekly Meeting']);
  });

  /**
   * What the create event form posts is what a browser date and time field
   * holds: a T between the date and the hour, and no seconds. A series created
   * from the form failed on the insert, because the length of the event came
   * out of that reading as no number at all.
   */
  it('creates a series from the times the create event form posts', async () => {
    const res = await post({
      ...BODY,
      start_time: '2026-09-07T18:00',
      end_time: '2026-09-07T19:30',
      recurrence: { days_of_week: ['Mon'], ends_on: '2026-09-21' },
    });
    expect(res.status).toBe(201);

    const { series, occurrences } = seriesDb.createSeriesWithOccurrences.mock.calls[0][0];
    expect(series).toMatchObject({ start_of_day: '18:00:00', duration_minutes: 90 });
    expect(occurrences.map(o => o.start)).toEqual([
      '2026-09-07 18:00:00', '2026-09-14 18:00:00', '2026-09-21 18:00:00',
    ]);
    expect(occurrences.map(o => o.end)).toEqual([
      '2026-09-07 19:30:00', '2026-09-14 19:30:00', '2026-09-21 19:30:00',
    ]);
  });

  it('explains times it cannot read rather than failing on the insert', async () => {
    const res = await post({ ...BODY, start_time: 'the seventh at six', end_time: 'half past seven' });
    expect(res.status).toBe(400);
    expect(seriesDb.createSeriesWithOccurrences).not.toHaveBeenCalled();
  });

  it('runs to the end of the term when the request names no end date', async () => {
    await post({ ...BODY, recurrence: { days_of_week: ['Tue'] } });
    const { series, occurrences } = seriesDb.createSeriesWithOccurrences.mock.calls[0][0];
    expect(occurrences.length).toBeGreaterThan(5);
    expect(series.ends_on).toBe(occurrences.at(-1).start.slice(0, 10));
  });

  it('needs an account', async () => {
    expect((await request(app).post('/api/v1/events/series').send(BODY)).status).toBe(401);
  });

  it('needs editor access to the RSO it writes to', async () => {
    getMembership.mockResolvedValue({ role: 'Member' });
    const res = await post(BODY);
    expect(res.status).toBe(403);
    expect(seriesDb.createSeriesWithOccurrences).not.toHaveBeenCalled();
  });

  it('still needs a title and a time range', async () => {
    expect((await post({ ...BODY, title: undefined })).status).toBe(400);
    expect((await post({ ...BODY, start_time: undefined })).status).toBe(400);
    expect((await post({ ...BODY, end_time: undefined })).status).toBe(400);
  });

  it('explains a repeat it cannot make sense of', async () => {
    const res = await post({ ...BODY, recurrence: { days_of_week: ['Someday'] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/day of the week/i);
    expect(seriesDb.createSeriesWithOccurrences).not.toHaveBeenCalled();
  });

  /**
   * One booked week is not a reason to refuse a term of meetings, and the
   * board has to be told which week it was.
   */
  it('leaves out a week whose room is taken, and reports the date', async () => {
    seriesDb.busyInRoom.mockResolvedValue([
      { start_time: '2026-09-08 18:30:00', end_time: '2026-09-08 20:00:00' },
    ]);
    const res = await post({ ...BODY, location_id: 7 });
    expect(res.status).toBe(201);
    expect(res.body.skipped).toEqual(['2026-09-08']);
    expect(res.body.created).toBe(5);
    const { occurrences } = seriesDb.createSeriesWithOccurrences.mock.calls[0][0];
    expect(occurrences.map(o => o.date)).not.toContain('2026-09-08');
  });

  it('reports a conflict, and writes nothing, when every week is taken', async () => {
    seriesDb.busyInRoom.mockResolvedValue([
      { start_time: '2026-09-01 00:00:00', end_time: '2026-10-01 00:00:00' },
    ]);
    const res = await post({ ...BODY, location_id: 7 });
    expect(res.status).toBe(409);
    expect(seriesDb.createSeriesWithOccurrences).not.toHaveBeenCalled();
  });

  it('asks about the room only when the event is in one', async () => {
    await post({ ...BODY, location_text: 'Zoom' });
    expect(seriesDb.busyInRoom).not.toHaveBeenCalled();
    const { event } = seriesDb.createSeriesWithOccurrences.mock.calls[0][0];
    expect(event).toMatchObject({ location_id: null, location_text: 'Zoom' });
  });

  it('writes the location note onto every occurrence of a new repeat', async () => {
    await post({ ...BODY, location_note: 'Use the north entrance.' });
    const { event } = seriesDb.createSeriesWithOccurrences.mock.calls[0][0];
    expect(event).toMatchObject({ location_note: 'Use the north entrance.' });
  });

  it('refuses a note longer than the column holds rather than creating the repeat', async () => {
    const res = await post({ ...BODY, location_note: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(seriesDb.createSeriesWithOccurrences).not.toHaveBeenCalled();
  });

  it('lets a global admin create a series for any RSO', async () => {
    getMembership.mockResolvedValue(null);
    const adminCookie = `via_token=${signToken({ net_id: 'boss', is_global_admin: 1 })}`;
    const res = await request(app).post('/api/v1/events/series')
      .set('Cookie', adminCookie).send(BODY);
    expect(res.status).toBe(201);
  });
});
