import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * Reporting a bug.
 *
 * Somebody who finds something wrong with VIA has had one way to say so, which
 * is to write to the address on the About page, and most people do not write an
 * email about a button. The About page carries a form now.
 *
 * Reporting is open, because a student should not have to sign in to say that a
 * page is broken, and it is bounded per address for the same reason that
 * anything open is. Reading the reports is a global admin's.
 */
vi.mock('../../db/queries/bugReports.js', () => ({
  createBugReport: vi.fn(async () => ({ insertId: 42 })),
  allBugReports: vi.fn(async () => [
    { report_id: 1, area: 'Calendar', summary: 'A week is missing', status: 'Open' },
  ]),
  setBugReportStatus: vi.fn(async () => ({ affectedRows: 1 })),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn(), getUserMemberships: vi.fn(async () => []),
}));

const app = (await import('../../app.js')).default;
const reportsDb = await import('../../db/queries/bugReports.js');

const secret = process.env.JWT_SECRET || 'dev_secret';
const admin = `via_token=${jwt.sign({ net_id: 'admin1', is_global_admin: true }, secret)}`;
const student = `via_token=${jwt.sign({ net_id: 'jdoe2', is_global_admin: false }, secret)}`;

const REPORT = {
  area: 'Calendar',
  summary: 'The last week of September is empty',
  detail: 'Our meeting on the thirtieth is on the events page but not on the grid.',
  page: '/calendar',
};

const reporting = (body, cookie) => {
  const call = request(app).post('/api/v1/bug-reports');
  if (cookie) call.set('Cookie', cookie);
  return call.send(body);
};

beforeEach(() => {
  vi.clearAllMocks();
  reportsDb.createBugReport.mockResolvedValue({ insertId: 42 });
  reportsDb.setBugReportStatus.mockResolvedValue({ affectedRows: 1 });
});

describe('POST /api/v1/bug-reports', () => {
  it('takes a report from somebody who is not signed in', async () => {
    const res = await reporting(REPORT);
    expect(res.status).toBe(201);
    expect(reportsDb.createBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ area: 'Calendar', reported_by: null })
    );
  });

  it('records who reported it when they are signed in', async () => {
    await reporting(REPORT, student);
    expect(reportsDb.createBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ reported_by: 'jdoe2' })
    );
  });

  it('needs an area and a summary', async () => {
    expect((await reporting({ ...REPORT, summary: '  ' })).status).toBe(400);
    expect((await reporting({ ...REPORT, area: '' })).status).toBe(400);
    expect(reportsDb.createBugReport).not.toHaveBeenCalled();
  });

  it('refuses an area that is not one of the ones the form offers', async () => {
    const res = await reporting({ ...REPORT, area: 'Somewhere else entirely' });
    expect(res.status).toBe(400);
    expect(reportsDb.createBugReport).not.toHaveBeenCalled();
  });

  it('refuses a summary longer than the column holds', async () => {
    const res = await reporting({ ...REPORT, summary: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });

  it('keeps an address to reply to only when one was given', async () => {
    await reporting({ ...REPORT, contact: '  jdoe2@illinois.edu ' });
    expect(reportsDb.createBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ contact: 'jdoe2@illinois.edu' })
    );
    reportsDb.createBugReport.mockClear();
    await reporting({ ...REPORT, contact: '   ' });
    expect(reportsDb.createBugReport).toHaveBeenCalledWith(
      expect.objectContaining({ contact: null })
    );
  });

  /** The reporter says where they were, and nothing says who they are. */
  it('records no address of any kind', async () => {
    await reporting(REPORT);
    const written = reportsDb.createBugReport.mock.calls[0][0];
    expect(Object.keys(written).sort()).toEqual(
      ['area', 'contact', 'detail', 'page', 'reported_by', 'summary']
    );
  });
});

describe('GET /api/v1/bug-reports', () => {
  it('is a global admin\'s to read', async () => {
    const res = await request(app).get('/api/v1/bug-reports').set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(res.body.reports[0].summary).toBe('A week is missing');
  });

  it('is not readable by a student, whose own report may name them', async () => {
    expect((await request(app).get('/api/v1/bug-reports').set('Cookie', student)).status).toBe(403);
    expect((await request(app).get('/api/v1/bug-reports')).status).toBe(401);
  });
});

describe('PATCH /api/v1/bug-reports/:id', () => {
  it('closes a report that has been dealt with', async () => {
    const res = await request(app).patch('/api/v1/bug-reports/42')
      .set('Cookie', admin).send({ status: 'Closed' });
    expect(res.status).toBe(200);
    expect(reportsDb.setBugReportStatus).toHaveBeenCalledWith(42, 'Closed');
  });

  it('refuses a status that is not one of the two', async () => {
    const res = await request(app).patch('/api/v1/bug-reports/42')
      .set('Cookie', admin).send({ status: 'Maybe' });
    expect(res.status).toBe(400);
  });

  it('refuses a student', async () => {
    const res = await request(app).patch('/api/v1/bug-reports/42')
      .set('Cookie', student).send({ status: 'Closed' });
    expect(res.status).toBe(403);
  });

  it('says so when there is no such report', async () => {
    reportsDb.setBugReportStatus.mockResolvedValue({ affectedRows: 0 });
    const res = await request(app).patch('/api/v1/bug-reports/999')
      .set('Cookie', admin).send({ status: 'Closed' });
    expect(res.status).toBe(404);
  });
});
