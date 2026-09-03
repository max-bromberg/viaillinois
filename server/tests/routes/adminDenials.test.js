import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getDenialSeries = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/accessDenials.js', () => ({
  getDenialSeries, upsertDenialBuckets: vi.fn(), pruneDenials: vi.fn(),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn().mockResolvedValue({ net_id: 'admin1', is_global_admin: 1 }),
  getAllLocalUsers: vi.fn().mockResolvedValue([]), upsertUser: vi.fn(),
  createLocalAccount: vi.fn(), updateUser: vi.fn(), deleteUser: vi.fn(),
  updateLocalPassword: vi.fn(), getLocalAccount: vi.fn(), inviteUser: vi.fn(),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');

const adminCookie = `via_token=${signToken({ net_id: 'admin1', is_global_admin: true })}`;

beforeEach(() => getDenialSeries.mockReset());

/**
 * The operator asked one question of this data: are users being denied access
 * often. This route answers it, and it is behind the global admin gate because
 * a refusal series is an availability signal rather than public information.
 */
describe('GET /api/v1/admin/denials', () => {
  it('refuses anybody who is not a global admin', async () => {
    const res = await request(app).get('/api/v1/admin/denials');
    expect(res.status).toBe(401);
  });

  it('answers the series for a global admin', async () => {
    getDenialSeries.mockResolvedValue([
      { day: '2026-09-03', reason: 'overloaded', denials: 12, clients: 3 },
    ]);
    const res = await request(app).get('/api/v1/admin/denials').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.denials).toHaveLength(1);
    expect(res.body.denials[0].reason).toBe('overloaded');
  });

  it('defaults to a week', async () => {
    getDenialSeries.mockResolvedValue([]);
    await request(app).get('/api/v1/admin/denials').set('Cookie', adminCookie);
    expect(getDenialSeries).toHaveBeenCalledWith(7);
  });

  it('accepts a window, and refuses one that is not a number', async () => {
    getDenialSeries.mockResolvedValue([]);
    await request(app).get('/api/v1/admin/denials?days=30').set('Cookie', adminCookie);
    expect(getDenialSeries).toHaveBeenCalledWith(30);
    const bad = await request(app).get('/api/v1/admin/denials?days=abc').set('Cookie', adminCookie);
    expect(bad.status).toBe(400);
  });

  it('caps the window, so one request cannot scan the whole table', async () => {
    getDenialSeries.mockResolvedValue([]);
    await request(app).get('/api/v1/admin/denials?days=100000').set('Cookie', adminCookie);
    expect(getDenialSeries).toHaveBeenCalledWith(90);
  });
});
