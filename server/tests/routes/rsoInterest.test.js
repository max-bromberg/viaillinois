import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../db/queries/advanced.js', () => ({
  callGetRSOStats: vi.fn().mockResolvedValue({ memberBreakdown: [], topTags: [] }),
  createEventTransactional: vi.fn(),
}));
const getInterestByRso = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/eventInterest.ts', () => ({ getInterestByRso }));
vi.mock('../../db/queries/eventFeedback.ts', () => ({
  getFeedbackByRso: vi.fn().mockResolvedValue([]), saveFeedback: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn().mockResolvedValue({ role: 'Board' }),
  getAllRsos: vi.fn().mockResolvedValue([]), getRsoById: vi.fn().mockResolvedValue(null),
  getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({ getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn() }));

const app = (await import('../../app.js')).default;
const cookie = `via_token=${jwt.sign({ net_id: 'board', is_global_admin: false }, 'dev_secret')}`;

/**
 * Interest is what replaced the RSVP count. The board reads it per upcoming
 * event, beside the members and the tags it already had.
 */
describe('GET /api/v1/rsos/:id/stats, interest', () => {
  it('lists how many people are interested in each upcoming event', async () => {
    getInterestByRso.mockResolvedValue([
      { eventId: 10, title: 'General meeting', startTime: '2026-09-10 18:00:00', interestCount: 12 },
    ]);
    const res = await request(app).get('/api/v1/rsos/1/stats').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.interest).toEqual([
      { event_id: 10, title: 'General meeting', start_time: expect.stringContaining('2026-09-10T18:00:00'), interest_count: 12 },
    ]);
    expect(getInterestByRso).toHaveBeenCalledWith(1);
  });
});
