import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const planEventImport = vi.fn();
const applyEventImport = vi.fn();
const planMidtermImport = vi.fn();
const applyMidtermImport = vi.fn();

vi.mock('../../services/calendarImport.js', () => ({
  planEventImport:   (...a) => planEventImport(...a),
  applyEventImport:  (...a) => applyEventImport(...a),
  planMidtermImport: (...a) => planMidtermImport(...a),
  applyMidtermImport:(...a) => applyMidtermImport(...a),
}));
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([]), getEventById: vi.fn(), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]), findEventsByUid: vi.fn(), createEvent: vi.fn(),
}));
vi.mock('../../db/queries/advanced.js', () => ({ createEventTransactional: vi.fn(), callGetRSOStats: vi.fn() }));
const memberships = vi.hoisted(() => ({ value: [] }));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn().mockResolvedValue({ role: 'Admin' }),
  getUserMemberships: vi.fn(async () => memberships.value),
}));
vi.mock('../../db/queries/users.js', () => ({ getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn() }));
vi.mock('../../db/queries/midterms.js', () => ({
  getMidterms: vi.fn().mockResolvedValue([]), createMidterm: vi.fn(),
  getConfirmedMidterms: vi.fn(), getAllMidtermsAdmin: vi.fn(), setMidtermStatus: vi.fn(),
  findMidtermsByUid: vi.fn(), updateMidterm: vi.fn(),
}));
vi.mock('../../db/queries/courses.js', () => ({ getCourses: vi.fn(), getCourseCodes: vi.fn() }));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');

const admin = `via_token=${signToken({ net_id: 'boss', is_global_admin: 1 })}`;
const member = `via_token=${signToken({ net_id: 'someone', is_global_admin: 0 })}`;
const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:X\r\nDTSTART:20261001T180000\r\nEND:VEVENT\r\nEND:VCALENDAR';

describe('POST /api/v1/events/import', () => {
  beforeEach(() => {
    planEventImport.mockClear();
    applyEventImport.mockClear();
    planEventImport.mockResolvedValue({ entries: [{ action: 'create', title: 'X' }], skipped: 0 });
    applyEventImport.mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
  });

  it('refuses an anonymous request', async () => {
    const res = await request(app).post('/api/v1/events/import').send({ rso_id: 1, ics: ICS });
    expect(res.status).toBe(401);
  });

  it('previews without changing anything when asked to', async () => {
    const res = await request(app).post('/api/v1/events/import')
      .set('Cookie', admin).send({ rso_id: 1, ics: ICS, preview: true });
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(applyEventImport).not.toHaveBeenCalled();
  });

  it('imports when not previewing', async () => {
    const res = await request(app).post('/api/v1/events/import')
      .set('Cookie', admin).send({ rso_id: 1, ics: ICS });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1 });
    expect(applyEventImport).toHaveBeenCalledWith({ ics: ICS, rsoId: 1, createdBy: 'boss' });
  });

  /**
   * Importing writes events for one RSO. requireRSOAdmin reads the id from the
   * path and this one is in the body, so the check lives in the controller and
   * needs its own test.
   */
  it('refuses someone with no editor rights in that RSO', async () => {
    const { getMembership } = await import('../../db/queries/rso.js');
    getMembership.mockResolvedValueOnce({ role: 'Member' });
    const res = await request(app).post('/api/v1/events/import')
      .set('Cookie', member).send({ rso_id: 1, ics: ICS, preview: true });
    expect(res.status).toBe(403);
    expect(planEventImport).not.toHaveBeenCalled();
  });

  it('requires the calendar text and the RSO', async () => {
    const noIcs = await request(app).post('/api/v1/events/import').set('Cookie', admin).send({ rso_id: 1 });
    expect(noIcs.status).toBe(400);
    const noRso = await request(app).post('/api/v1/events/import').set('Cookie', admin).send({ ics: ICS });
    expect(noRso.status).toBe(400);
  });

  it('reports a file that is not a calendar as the sender getting it wrong', async () => {
    planEventImport.mockRejectedValue(new Error('That file has no calendar entries in it.'));
    const res = await request(app).post('/api/v1/events/import')
      .set('Cookie', admin).send({ rso_id: 1, ics: 'nope', preview: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/calendar/i);
  });
});

describe('POST /api/v1/midterms/import', () => {
  beforeEach(() => {
    planMidtermImport.mockClear();
    applyMidtermImport.mockClear();
    planMidtermImport.mockResolvedValue({ entries: [], skipped: 0, unmatched: [] });
    applyMidtermImport.mockResolvedValue({ created: 2, updated: 0, skipped: 0, unmatched: [] });
    memberships.value = [];
  });

  it('refuses an anonymous request', async () => {
    expect((await request(app).post('/api/v1/midterms/import').send({ ics: ICS })).status).toBe(401);
  });

  /**
   * An import writes the shared exam schedule, so it is held to the same bar as
   * deleting from it: a global admin, or anyone who sits on an RSO board.
   */
  it('refuses a signed in user who runs nothing', async () => {
    const res = await request(app).post('/api/v1/midterms/import').set('Cookie', member).send({ ics: ICS });
    expect(res.status).toBe(403);
    expect(applyMidtermImport).not.toHaveBeenCalled();
  });

  it('refuses an ordinary member of an RSO', async () => {
    memberships.value = [{ rso_id: 3, name: 'IEEE UIUC', role: 'Member' }];
    const res = await request(app).post('/api/v1/midterms/import').set('Cookie', member).send({ ics: ICS });
    expect(res.status).toBe(403);
    expect(applyMidtermImport).not.toHaveBeenCalled();
  });

  it('refuses an editor of an RSO', async () => {
    memberships.value = [{ rso_id: 3, name: 'IEEE UIUC', role: 'Editor' }];
    const res = await request(app).post('/api/v1/midterms/import').set('Cookie', member).send({ ics: ICS });
    expect(res.status).toBe(403);
    expect(applyMidtermImport).not.toHaveBeenCalled();
  });

  it('imports for a global admin', async () => {
    const res = await request(app).post('/api/v1/midterms/import').set('Cookie', admin).send({ ics: ICS });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2 });
  });

  it('imports for a board member of any RSO', async () => {
    memberships.value = [{ rso_id: 3, name: 'IEEE UIUC', role: 'Board' }];
    const res = await request(app).post('/api/v1/midterms/import').set('Cookie', member).send({ ics: ICS });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2 });
  });

  it('previews for a board member without writing anything', async () => {
    memberships.value = [{ rso_id: 3, name: 'IEEE UIUC', role: 'Board' }];
    const res = await request(app).post('/api/v1/midterms/import')
      .set('Cookie', member).send({ ics: ICS, preview: true });
    expect(res.status).toBe(200);
    expect(planMidtermImport).toHaveBeenCalled();
    expect(applyMidtermImport).not.toHaveBeenCalled();
  });
});
