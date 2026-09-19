import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getMidterms = vi.fn();

vi.mock('../../db/queries/midterms.js', () => ({
  getMidterms: (...a) => getMidterms(...a),
  getConfirmedMidterms: vi.fn().mockResolvedValue([]),
  getAllMidtermsAdmin: vi.fn().mockResolvedValue([]),
  createMidterm: vi.fn(), updateMidterm: vi.fn(), deleteMidterm: vi.fn(),
  deleteMidterms: vi.fn(), getMidtermById: vi.fn(), findMidtermsByUid: vi.fn(),
  setMidtermStatus: vi.fn(), countMidterms: vi.fn().mockResolvedValue([{ total: 0 }]),
}));
vi.mock('../../db/queries/courses.js', () => ({
  getCourses: vi.fn().mockResolvedValue([]), getCourseCodes: vi.fn().mockResolvedValue([]),
  countCourses: vi.fn().mockResolvedValue([{ total: 0 }]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(), inviteUser: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn().mockResolvedValue(null), getUserMemberships: vi.fn().mockResolvedValue([]),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');

/**
 * The exam schedule is read by anybody, signed in or not.
 *
 * Who submitted an entry is a NetID, which names a student, and the listing was
 * handing it to every anonymous caller along with the exam. The platform is
 * careful about this two files away: an organization's member list withholds
 * the NetID from anybody not signed in and the email address from anybody not
 * on the board, and rsoPrivacy.test.js exists to hold that line. The exam
 * schedule was not held to it.
 *
 * The submitter is still needed inside the platform, so the admin listing keeps
 * it. What changes is that the public one stops carrying it.
 */
const row = {
  midterm_id: 7,
  course_code: 'ECE 210',
  course_title: 'Analog Signal Processing',
  title: 'Midterm 1',
  start_time: '2026-10-01 19:00:00',
  end_time: '2026-10-01 21:00:00',
  status: 'Confirmed',
  building: 'Electrical & Computer Eng Bldg',
  room_number: '1002',
  location_text: 'ECEB 1002',
  submitted_by: 'astudent',
};

describe('the public exam schedule', () => {
  beforeEach(() => {
    getMidterms.mockReset();
    getMidterms.mockResolvedValue([row]);
  });

  it('does not tell an anonymous reader who submitted an entry', async () => {
    const res = await request(app).get('/api/v1/midterms');
    expect(res.status).toBe(200);
    expect(res.body.midterms[0]).not.toHaveProperty('submitted_by');
  });

  it('does not tell a signed in reader either, because a NetID is not theirs to have', async () => {
    const res = await request(app).get('/api/v1/midterms')
      .set('Cookie', `via_token=${signToken({ net_id: 'someone' })}`);
    expect(res.status).toBe(200);
    expect(res.body.midterms[0]).not.toHaveProperty('submitted_by');
  });

  it('still answers with the exam itself, which is what the page is for', async () => {
    const res = await request(app).get('/api/v1/midterms');
    expect(res.body.midterms[0]).toMatchObject({
      midterm_id: 7,
      course_code: 'ECE 210',
      course_title: 'Analog Signal Processing',
      title: 'Midterm 1',
      building: 'Electrical & Computer Eng Bldg',
      room_number: '1002',
      status: 'Confirmed',
    });
    // The times go out carrying the campus offset, which campusTimeJson puts
    // on every time this API publishes, so the day is asserted rather than the
    // string the database handed over.
    expect(res.body.midterms[0].start_time.startsWith('2026-10-01')).toBe(true);
    expect(res.body.midterms[0].end_time.startsWith('2026-10-01')).toBe(true);
  });

  it('carries no other field naming a person, whatever the query adds later', async () => {
    getMidterms.mockResolvedValue([{ ...row, net_id: 'astudent', email: 'a@illinois.edu' }]);
    const res = await request(app).get('/api/v1/midterms');
    const answered = Object.keys(res.body.midterms[0]);
    expect(answered).not.toContain('submitted_by');
    expect(answered).not.toContain('net_id');
    expect(answered).not.toContain('email');
  });
});
