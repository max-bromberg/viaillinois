import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../db/queries/advanced.js', () => ({
  callGetRSOStats: vi.fn().mockResolvedValue({
    memberBreakdown: [{ role: 'Admin', count: 1 }, { role: 'Member', count: 3 }],
    topTags: [{ tag_name: 'Free Food', usage_count: 4 }],
  }),
  createEventTransactional: vi.fn(),
}));

vi.mock('../../db/queries/eventInterest.ts', () => ({ getInterestByRso: vi.fn().mockResolvedValue([]) }));

const getFeedbackByRso = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock('../../db/queries/eventFeedback.ts', () => ({ getFeedbackByRso, saveFeedback: vi.fn() }));

vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn().mockResolvedValue({ role: 'Admin' }),
  getAllRsos: vi.fn().mockResolvedValue([]),
  getRsoById: vi.fn().mockResolvedValue(null),
  getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;

// Sign a fake token with the dev secret so requireAuth passes in tests
const fakeToken = jwt.sign(
  { net_id: 'testuser', is_global_admin: false },
  'dev_secret',
  { expiresIn: '1h' }
);

/**
 * What people thought, as the board is allowed to read it: the average, how
 * many said something, and what they wrote. Who gave which rating is never
 * answered, because a board that can work that out is a board nobody tells the
 * truth to.
 */
describe('GET /api/v1/rsos/:id/stats, feedback', () => {
  it('carries the average, the count and the comments per event', async () => {
    getFeedbackByRso.mockResolvedValue([
      {
        eventId: 10, title: 'General meeting', startTime: '2026-09-10 18:00:00',
        average: 4.5, ratings: 2, comments: ['The pizza arrived on time.'],
      },
      { eventId: 11, title: 'Later', startTime: '2026-09-17 18:00:00', average: null, ratings: 0, comments: [] },
    ]);
    const res = await request(app).get('/api/v1/rsos/1/stats').set('Cookie', `via_token=${fakeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.feedback).toEqual([
      {
        event_id: 10, title: 'General meeting',
        start_time: expect.stringContaining('2026-09-10T18:00:00'),
        average_rating: 4.5, rating_count: 2, comments: ['The pizza arrived on time.'],
      },
      {
        event_id: 11, title: 'Later',
        start_time: expect.stringContaining('2026-09-17T18:00:00'),
        average_rating: null, rating_count: 0, comments: [],
      },
    ]);
    expect(getFeedbackByRso).toHaveBeenCalledWith(1);
  });

  it('never says who rated what', async () => {
    getFeedbackByRso.mockResolvedValue([{
      eventId: 10, title: 'General meeting', startTime: '2026-09-10 18:00:00',
      average: 5, ratings: 1, comments: ['Loud but good.'],
    }]);
    const res = await request(app).get('/api/v1/rsos/1/stats').set('Cookie', `via_token=${fakeToken}`);
    expect(JSON.stringify(res.body)).not.toContain('net_id');
    expect(Object.keys(res.body.feedback[0]).sort())
      .toEqual(['average_rating', 'comments', 'event_id', 'rating_count', 'start_time', 'title']);
  });
});

describe('GET /api/v1/rsos/:id/stats', () => {
  it('returns 200 with memberBreakdown and topTags', async () => {
    const res = await request(app)
      .get('/api/v1/rsos/1/stats')
      .set('Cookie', `via_token=${fakeToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.memberBreakdown)).toBe(true);
    expect(Array.isArray(res.body.topTags)).toBe(true);
    expect(res.body.memberBreakdown[0].role).toBe('Admin');
    expect(res.body.topTags[0].tag_name).toBe('Free Food');
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/rsos/1/stats');
    expect(res.status).toBe(401);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app)
      .get('/api/v1/rsos/abc/stats')
      .set('Cookie', `via_token=${fakeToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 500 when the DB layer throws', async () => {
    const { callGetRSOStats } = await import('../../db/queries/advanced.js');
    callGetRSOStats.mockRejectedValueOnce(new Error('DB down'));
    const res = await request(app)
      .get('/api/v1/rsos/1/stats')
      .set('Cookie', `via_token=${fakeToken}`);
    expect(res.status).toBe(500);
  });
});
