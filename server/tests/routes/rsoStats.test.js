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
