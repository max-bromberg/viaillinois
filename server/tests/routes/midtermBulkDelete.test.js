import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * Removing several exams at once.
 *
 * A calendar imported with the wrong course codes, or a term that has ended,
 * leaves a page of entries to take off the schedule, and taking them off one
 * confirmation at a time is what boards were doing. The bar is the one a single
 * removal is held to, because removing ten entries is not a different power
 * from removing one of them ten times.
 */
vi.mock('../../db/queries/midterms.js', () => ({
  getMidterms: vi.fn(async () => []),
  createMidterm: vi.fn(),
  deleteMidterm: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  deleteMidterms: vi.fn(async ids => ({ affectedRows: ids.length })),
  getAllMidtermsAdmin: vi.fn().mockResolvedValue([]),
  setMidtermStatus: vi.fn(),
  getConfirmedMidterms: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));
const memberships = vi.hoisted(() => ({ value: [] }));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn(),
  getUserMemberships: vi.fn(async () => memberships.value),
}));

const app = (await import('../../app.js')).default;
const midtermsDb = await import('../../db/queries/midterms.js');

const secret = process.env.JWT_SECRET || 'dev_secret';
const adminToken = jwt.sign({ net_id: 'admin1', is_global_admin: true }, secret);
const memberToken = jwt.sign({ net_id: 'plain1', is_global_admin: false }, secret);

const removing = ids =>
  request(app).delete(`/api/v1/midterms?ids=${ids}`).set('Cookie', `via_token=${adminToken}`);

beforeEach(() => {
  vi.clearAllMocks();
  memberships.value = [];
  midtermsDb.deleteMidterms.mockImplementation(async ids => ({ affectedRows: ids.length }));
});

describe('DELETE /api/v1/midterms', () => {
  it('removes every entry it was given, and says how many went', async () => {
    const res = await removing('4,7,9');
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(3);
    expect(midtermsDb.deleteMidterms).toHaveBeenCalledWith([4, 7, 9]);
  });

  it('refuses a reader who sits on no board', async () => {
    const res = await request(app).delete('/api/v1/midterms?ids=4')
      .set('Cookie', `via_token=${memberToken}`);
    expect(res.status).toBe(403);
    expect(midtermsDb.deleteMidterms).not.toHaveBeenCalled();
  });

  it('refuses somebody who is not signed in at all', async () => {
    const res = await request(app).delete('/api/v1/midterms?ids=4');
    expect(res.status).toBe(401);
  });

  it('lets a board member remove them, as a single removal does', async () => {
    memberships.value = [{ rso_id: 2, role: 'Board' }];
    const res = await request(app).delete('/api/v1/midterms?ids=4,5')
      .set('Cookie', `via_token=${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
  });

  it('refuses a list that is not a list of whole numbers', async () => {
    const res = await removing('4,banana');
    expect(res.status).toBe(400);
    expect(midtermsDb.deleteMidterms).not.toHaveBeenCalled();
  });

  it('refuses an empty list rather than deleting everything', async () => {
    const res = await request(app).delete('/api/v1/midterms?ids=')
      .set('Cookie', `via_token=${adminToken}`);
    expect(res.status).toBe(400);
    expect(midtermsDb.deleteMidterms).not.toHaveBeenCalled();
  });

  it('refuses more entries than a person could have chosen on a page', async () => {
    const res = await removing(Array.from({ length: 501 }, (_, i) => i + 1).join(','));
    expect(res.status).toBe(400);
    expect(midtermsDb.deleteMidterms).not.toHaveBeenCalled();
  });
});
