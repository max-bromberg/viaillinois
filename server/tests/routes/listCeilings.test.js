import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getMidterms = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getConfirmedMidterms = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getCourses = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const getAllRsos = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../../db/queries/midterms.js', () => ({
  getMidterms, getConfirmedMidterms,
  createMidterm: vi.fn(), updateMidterm: vi.fn(), deleteMidterm: vi.fn(),
  findMidtermsByUid: vi.fn(), getAllMidtermsAdmin: vi.fn(), setMidtermStatus: vi.fn(),
  getConfirmedMidtermsForScheduler: vi.fn(),
}));
vi.mock('../../db/queries/courses.js', () => ({
  getCourses, upsertCourse: vi.fn(), upsertSection: vi.fn(), getCourseCodes: vi.fn(),
  getSectionsByCourse: vi.fn(), getSectionsForCourses: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getAllRsos, getRsoById: vi.fn(), createRso: vi.fn(), updateRso: vi.fn(),
  deleteRso: vi.fn(), addMember: vi.fn(), removeMember: vi.fn(), getRsoStats: vi.fn(),
}));

const app = (await import('../../app.js')).default;

beforeEach(() => {
  getMidterms.mockClear(); getConfirmedMidterms.mockClear();
  getCourses.mockClear(); getAllRsos.mockClear();
});

/**
 * These four endpoints used to validate a page and then hand back the whole
 * table anyway, because the queries behind them took no limit. A ceiling that
 * the database never sees is a ceiling in name only, so these assert that the
 * clamp readPaging worked out is the clamp the query is given.
 */
describe('the list ceilings reach the database', () => {
  it('bounds the midterm list, and clamps a limit above the ceiling', async () => {
    await request(app).get('/api/v1/midterms?limit=999999');
    expect(getMidterms).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
  });

  it('sends the campus date filter with the bound, not after it', async () => {
    await request(app).get('/api/v1/midterms?limit=10');
    const filters = getMidterms.mock.calls[0][0];
    expect(filters.limit).toBe(10);
    expect(filters.endingOnOrAfter).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('bounds the confirmed midterm list at its own, larger ceiling', async () => {
    await request(app).get('/api/v1/midterms/confirmed?limit=999999');
    expect(getConfirmedMidterms).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 }));
  });

  it('still hands the calendar the whole confirmed set when it asks for no limit', async () => {
    await request(app).get('/api/v1/midterms/confirmed');
    expect(getConfirmedMidterms).toHaveBeenCalledWith({ limit: 500, offset: 0 });
  });

  it('bounds the course list', async () => {
    await request(app).get('/api/v1/midterms/courses?limit=999999');
    expect(getCourses).toHaveBeenCalledWith(expect.objectContaining({ limit: 5000 }));
  });

  it('bounds the RSO list, and passes the offset through', async () => {
    await request(app).get('/api/v1/rsos?limit=999999&offset=25');
    expect(getAllRsos).toHaveBeenCalledWith({ limit: 500, offset: 25 });
  });

  it('gives each of them the route default when no limit is asked for', async () => {
    await request(app).get('/api/v1/rsos');
    expect(getAllRsos).toHaveBeenCalledWith({ limit: 500, offset: 0 });
  });

  it('still refuses a page too far in, without asking the database', async () => {
    const res = await request(app).get('/api/v1/rsos?offset=99999');
    expect(res.status).toBe(400);
    expect(getAllRsos).not.toHaveBeenCalled();
  });
});
