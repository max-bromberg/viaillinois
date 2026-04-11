import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../db/queries/rso.js', () => ({
  getAllRsos:    vi.fn().mockResolvedValue([{ rso_id: 1, name: 'IEEE UIUC' }]),
  getRsoById:   vi.fn().mockResolvedValue([{
    rso_id: 1, rso_name: 'IEEE UIUC', description: 'The IEEE student branch',
    logo_color: '#000000', founded_year: 2000, event_count: 5,
    net_id: 'jdoe2', full_name: 'Jane Doe', email: 'jdoe2@illinois.edu',
    role: 'Admin', joined_at: '2024-01-01T00:00:00.000Z',
  }]),
  createRso:       vi.fn().mockResolvedValue({ insertId: 99 }),
  updateRso:       vi.fn().mockResolvedValue({ affectedRows: 1 }),
  getMembership:   vi.fn().mockResolvedValue({ role: 'Admin' }),
  addMember:       vi.fn().mockResolvedValue(undefined),
  removeMember:    vi.fn().mockResolvedValue({ affectedRows: 1 }),
  getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;

describe('GET /api/v1/rsos', () => {
  it('returns 200 with rsos array', async () => {
    const res = await request(app).get('/api/v1/rsos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rsos)).toBe(true);
  });
});

describe('GET /api/v1/rsos/:id', () => {
  it('returns shaped rso object with members array', async () => {
    const res = await request(app).get('/api/v1/rsos/1');
    expect(res.status).toBe(200);
    expect(res.body.rso.rso_id).toBe(1);
    expect(res.body.rso.rso_name).toBe('IEEE UIUC');
    expect(Array.isArray(res.body.rso.members)).toBe(true);
    expect(res.body.rso.members[0].net_id).toBe('jdoe2');
  });

  it('returns 404 when rso not found', async () => {
    const { getRsoById } = await import('../../db/queries/rso.js');
    getRsoById.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/v1/rsos/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/rsos', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/rsos').send({ name: 'New RSO' });
    expect(res.status).toBe(401);
  });
});
