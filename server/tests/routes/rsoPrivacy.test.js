import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const getRsoById = vi.fn();
const getUserMemberships = vi.fn();

vi.mock('../../db/queries/rso.js', () => ({
  getRsoById: (...a) => getRsoById(...a),
  getUserMemberships: (...a) => getUserMemberships(...a),
  getAllRsos: vi.fn().mockResolvedValue([]), getMembership: vi.fn().mockResolvedValue(null),
  addMember: vi.fn(), removeMember: vi.fn(), updateRso: vi.fn(), createRso: vi.fn(), deleteRso: vi.fn(),
}));
vi.mock('../../db/queries/events.js', () => ({
  getEventsByRso: vi.fn().mockResolvedValue([]), getPublicEvents: vi.fn().mockResolvedValue([]),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]), countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getEventById: vi.fn(), updateEvent: vi.fn(), deleteEvent: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
}));
vi.mock('../../db/queries/advanced.js', () => ({ createEventTransactional: vi.fn(), callGetRSOStats: vi.fn() }));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(), inviteUser: vi.fn(),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');

const ROW = {
  rso_id: 1, rso_name: 'IEEE', description: null, logo_color: '#000', founded_year: 1952, event_count: 0,
  net_id: 'member1', full_name: 'A Member', email: 'member1@illinois.edu', role: 'Member',
  joined_at: '2026-01-01 00:00:00', invited_at: null,
};

const cookieFor = user => `via_token=${signToken(user)}`;
const get = cookie => cookie
  ? request(app).get('/api/v1/rsos/1').set('Cookie', cookie)
  : request(app).get('/api/v1/rsos/1');

/**
 * A member list is directory information for the people running the RSO, not
 * for everyone with an account. Email addresses in particular are personal
 * data, and handing them to any signed in user makes the platform a scraping
 * target for anyone who can log in, which at UIUC is every student.
 */
describe('GET /api/v1/rsos/:id member privacy', () => {
  beforeEach(() => {
    getRsoById.mockResolvedValue([ROW]);
    getUserMemberships.mockResolvedValue([]);
  });

  it('shows no email to an anonymous viewer', async () => {
    const res = await get(null);
    expect(res.body.rso.members[0].email).toBeUndefined();
    expect(res.body.rso.members[0].full_name).toBe('A Member');
  });

  it('shows no email to a signed in user who is not on this RSO', async () => {
    const res = await get(cookieFor({ net_id: 'outsider', is_global_admin: 0 }));
    expect(res.status).toBe(200);
    expect(res.body.rso.members[0].email).toBeUndefined();
  });

  it('shows no email to an ordinary member of this RSO', async () => {
    getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Member' }]);
    const res = await get(cookieFor({ net_id: 'member1', is_global_admin: 0 }));
    expect(res.body.rso.members[0].email).toBeUndefined();
  });

  it('shows emails to the board of this RSO, who need them to run it', async () => {
    getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Board' }]);
    const res = await get(cookieFor({ net_id: 'chair', is_global_admin: 0 }));
    expect(res.body.rso.members[0].email).toBe('member1@illinois.edu');
  });

  it('shows emails to a global admin', async () => {
    const res = await get(cookieFor({ net_id: 'boss', is_global_admin: 1 }));
    expect(res.body.rso.members[0].email).toBe('member1@illinois.edu');
  });

  it('does not leak the board of another RSO into this one', async () => {
    getUserMemberships.mockResolvedValue([{ rso_id: 99, role: 'Board' }]);
    const res = await get(cookieFor({ net_id: 'other-chair', is_global_admin: 0 }));
    expect(res.body.rso.members[0].email).toBeUndefined();
  });
});
