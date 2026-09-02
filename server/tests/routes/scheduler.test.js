import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/intelligentScheduler.js', () => ({
  recommend: vi.fn().mockResolvedValue({
    curatedPicks: [{ start: '2026-05-01T18:00:00.000Z', end: '2026-05-01T19:00:00.000Z', location: { location_id: 1, building: 'ECEB', room_number: '2013', max_capacity: 60 }, score: 88, insights: [] }],
    allOptions: [],
  }),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;

const userToken = jwt.sign(
  { net_id: 'jdoe2', is_global_admin: false },
  process.env.JWT_SECRET || 'dev_secret',
  { expiresIn: '1h' }
);

describe('POST /api/v1/scheduler/recommend', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/scheduler/recommend').send({
      durationMinutes: 60,
      dateRange: { start: '2026-05-01', end: '2026-05-10' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when dateRange is missing', async () => {
    const res = await request(app)
      .post('/api/v1/scheduler/recommend')
      .set('Cookie', `via_token=${userToken}`)
      .send({ durationMinutes: 60 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('dateRange.start and dateRange.end are required');
  });

  it('returns 400 when dateRange.start is not before dateRange.end', async () => {
    const res = await request(app)
      .post('/api/v1/scheduler/recommend')
      .set('Cookie', `via_token=${userToken}`)
      .send({ durationMinutes: 60, dateRange: { start: '2026-05-10', end: '2026-05-01' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('dateRange.start must be before dateRange.end');
  });

  it('returns 200 with recommendations for an authenticated request', async () => {
    const res = await request(app)
      .post('/api/v1/scheduler/recommend')
      .set('Cookie', `via_token=${userToken}`)
      .send({ durationMinutes: 60, dateRange: { start: '2026-05-01', end: '2026-05-10' } });
    expect(res.status).toBe(200);
    expect(res.body.curatedPicks).toHaveLength(1);
  });
});

/**
 * Searching for a slot that works every week is the same request with a repeat
 * attached, so what the endpoint has to do is carry it through and refuse a
 * repeat it cannot make sense of.
 */
const { recommend } = await import('../../services/intelligentScheduler.js');

describe('POST /api/v1/scheduler/recommend, for a repeat', () => {
  const send = body => request(app)
    .post('/api/v1/scheduler/recommend')
    .set('Cookie', `via_token=${userToken}`)
    .send({ durationMinutes: 60, dateRange: { start: '2026-09-01', end: '2026-09-29' }, ...body });

  it('carries the repeat through to the search', async () => {
    recommend.mockClear();
    const res = await send({ recurrence: { intervalWeeks: 2, daysOfWeek: ['Tue'], until: '2026-12-08' } });
    expect(res.status).toBe(200);
    expect(recommend.mock.calls[0][0].recurrence).toEqual({
      intervalWeeks: 2, daysOfWeek: ['Tue'], until: '2026-12-08',
    });
  });

  it('searches to the end of the term when the repeat names no end', async () => {
    recommend.mockClear();
    await send({ recurrence: { daysOfWeek: ['Tue'] } });
    const { recurrence } = recommend.mock.calls[0][0];
    expect(recurrence.intervalWeeks).toBe(1);
    expect(recurrence.until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses a day of the week it does not recognise', async () => {
    const res = await send({ recurrence: { daysOfWeek: ['Someday'] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/day of the week/i);
  });

  it('refuses an interval that is not a whole number of weeks it can hold', async () => {
    expect((await send({ recurrence: { intervalWeeks: 0, daysOfWeek: ['Tue'] } })).status).toBe(400);
    expect((await send({ recurrence: { intervalWeeks: 99, daysOfWeek: ['Tue'] } })).status).toBe(400);
  });

  it('refuses a repeat that ends before the search begins', async () => {
    const res = await send({ recurrence: { daysOfWeek: ['Tue'], until: '2026-08-01' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/before/i);
  });

  it('searches for one event when no repeat is asked for', async () => {
    recommend.mockClear();
    await send({});
    expect(recommend.mock.calls[0][0].recurrence).toBeNull();
  });
});
