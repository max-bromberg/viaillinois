import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// waitingCount is part of this module's surface now, because the shedding
// middleware reads it on every request that is not the health endpoint.
vi.mock('../../db/pool.js', () => ({
  default: { query: vi.fn() }, query: vi.fn(), waitingCount: () => 0,
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const app = (await import('../../app.js')).default;

/**
 * The form, the scheduler and the importer all need to agree on when the term
 * ends, and the only way they can is to ask the same question of one calendar.
 */
describe('GET /api/v1/semester/current', () => {
  it('describes the term the platform is in', async () => {
    const res = await request(app).get('/api/v1/semester/current');
    expect(res.status).toBe(200);
    expect(res.body.semester.code).toMatch(/^\d{4}-(fa|sp|su)$/);
    expect(res.body.semester.label).toMatch(/^(Fall|Spring|Summer) \d{4}$/);
  });

  it('says when instruction runs, so a repeat can end where the term does', async () => {
    const { semester } = (await request(app).get('/api/v1/semester/current')).body;
    expect(semester.instruction_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(semester.instruction_end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(semester.instruction_end > semester.instruction_start).toBe(true);
  });

  it('names the weeks nobody is on campus, so a repeat can skip them', async () => {
    const { semester } = (await request(app).get('/api/v1/semester/current')).body;
    expect(Array.isArray(semester.breaks)).toBe(true);
    for (const range of semester.breaks) {
      expect(range.name.length).toBeGreaterThan(0);
      expect(range.end >= range.start).toBe(true);
    }
  });

  it('needs no account, since a calendar is not private', async () => {
    expect((await request(app).get('/api/v1/semester/current')).status).toBe(200);
  });
});
