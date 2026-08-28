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
