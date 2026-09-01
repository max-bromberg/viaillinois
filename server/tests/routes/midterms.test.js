import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const midtermRows = vi.hoisted(() => ({ value: [{ midterm_id: 1, title: 'ECE 110 Midterm 1' }] }));

vi.mock('../../db/queries/midterms.js', () => ({
  getMidterms:      vi.fn(async () => midtermRows.value),
  createMidterm:    vi.fn().mockResolvedValue({ insertId: 10 }),
  deleteMidterm:    vi.fn().mockResolvedValue({ affectedRows: 1 }),
  getAllMidtermsAdmin: vi.fn().mockResolvedValue([]),
  setMidtermStatus: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  getConfirmedMidterms: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn(), getUserMemberships: vi.fn().mockResolvedValue([]),
}));

const app = (await import('../../app.js')).default;
const midtermsDb = await import('../../db/queries/midterms.js');

const secret = process.env.JWT_SECRET || 'dev_secret';
const adminToken = jwt.sign({ net_id: 'admin1', is_global_admin: true }, secret);
const userToken  = jwt.sign({ net_id: 'plain1', is_global_admin: false }, secret);

beforeEach(() => {
  midtermRows.value = [{ midterm_id: 1, title: 'ECE 110 Midterm 1' }];
});

describe('GET /api/v1/midterms', () => {
  it('returns 200 with midterms array', async () => {
    const res = await request(app).get('/api/v1/midterms');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.midterms)).toBe(true);
  });

  /**
   * A stored time is a campus wall clock reading. Published without the offset
   * it was read in the reader's own zone, so the same exam showed a different
   * hour depending on where the student happened to be sitting.
   */
  it('publishes exam times with the campus offset rather than bare wall clock', async () => {
    midtermRows.value = [{
      midterm_id: 1, title: 'ECE 110 Midterm 1',
      start_time: '2099-07-15 18:00:00', end_time: '2099-07-15 20:00:00',
    }];
    const res = await request(app).get('/api/v1/midterms');
    expect(res.body.midterms[0].start_time).toBe('2099-07-15T18:00:00-05:00');
    expect(res.body.midterms[0].end_time).toBe('2099-07-15T20:00:00-05:00');
  });

  it('uses central standard time for an exam in the winter', async () => {
    midtermRows.value = [{
      midterm_id: 1, title: 'ECE 110 Midterm 1',
      start_time: '2099-01-15 18:00:00', end_time: '2099-01-15 20:00:00',
    }];
    const res = await request(app).get('/api/v1/midterms');
    expect(res.body.midterms[0].start_time).toBe('2099-01-15T18:00:00-06:00');
  });

  /** An exam is listed until the campus day after it has begun. */
  it('drops an exam that finished before today on campus', async () => {
    midtermRows.value = [
      { midterm_id: 1, title: 'Past',   end_time: '2000-01-15 20:00:00' },
      { midterm_id: 2, title: 'Future', end_time: '2099-01-15 20:00:00' },
    ];
    const res = await request(app).get('/api/v1/midterms');
    expect(res.body.midterms.map(m => m.midterm_id)).toEqual([2]);
  });
});

/**
 * Deleting is held to the same bar as confirming, because both decide what the
 * exam schedule says, and students plan around what it says.
 */
describe('DELETE /api/v1/midterms/:id', () => {
  beforeEach(() => {
    midtermsDb.deleteMidterm.mockClear();
    midtermsDb.deleteMidterm.mockResolvedValue({ affectedRows: 1 });
  });

  it('refuses an anonymous caller', async () => {
    const res = await request(app).delete('/api/v1/midterms/1');
    expect(res.status).toBe(401);
    expect(midtermsDb.deleteMidterm).not.toHaveBeenCalled();
  });

  it('refuses a signed in user who is not a global admin', async () => {
    const res = await request(app).delete('/api/v1/midterms/1').set('Cookie', `via_token=${userToken}`);
    expect(res.status).toBe(403);
    expect(midtermsDb.deleteMidterm).not.toHaveBeenCalled();
  });

  it('deletes the midterm for a global admin', async () => {
    const res = await request(app).delete('/api/v1/midterms/7').set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(midtermsDb.deleteMidterm).toHaveBeenCalledWith(7);
  });

  it('reports a midterm that is not there rather than claiming success', async () => {
    midtermsDb.deleteMidterm.mockResolvedValue({ affectedRows: 0 });
    const res = await request(app).delete('/api/v1/midterms/999').set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('rejects an id that is not a number', async () => {
    const res = await request(app).delete('/api/v1/midterms/abc').set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(400);
    expect(midtermsDb.deleteMidterm).not.toHaveBeenCalled();
  });
});
