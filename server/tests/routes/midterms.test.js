import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../db/queries/midterms.js', () => ({
  getMidterms:   vi.fn().mockResolvedValue([{ midterm_id: 1, title: 'ECE 110 Midterm 1', score: 5 }]),
  createMidterm: vi.fn().mockResolvedValue({ insertId: 10 }),
  upsertVote:    vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;

describe('GET /api/v1/midterms', () => {
  it('returns 200 with midterms array', async () => {
    const res = await request(app).get('/api/v1/midterms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.midterms)).toBe(true);
  });
});

describe('POST /api/v1/midterms/:id/vote', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/v1/midterms/1/vote').send({ value: 1 });
    expect(res.status).toBe(401);
  });
});
