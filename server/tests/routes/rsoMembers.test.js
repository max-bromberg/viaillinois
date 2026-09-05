import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../db/queries/outbox.ts', async () =>
  (await import('../support/outboxMock.js')).outboxMock());

const addMember = vi.fn();
const inviteUser = vi.fn();
const getUserByNetId = vi.fn();

vi.mock('../../db/queries/rso.js', () => ({
  addMember: (...a) => addMember(...a),
  removeMember: vi.fn().mockResolvedValue({ affectedRows: 1 }),
  getMembership: vi.fn().mockResolvedValue({ role: 'Board' }),
  getUserMemberships: vi.fn().mockResolvedValue([]),
  getAllRsos: vi.fn().mockResolvedValue([]),
  getRsoById: vi.fn().mockResolvedValue([]),
  updateRso: vi.fn(), createRso: vi.fn(), deleteRso: vi.fn(),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: (...a) => getUserByNetId(...a),
  inviteUser: (...a) => inviteUser(...a),
  upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([]), countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]), getEventById: vi.fn(), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
}));
vi.mock('../../db/queries/advanced.js', () => ({ createEventTransactional: vi.fn(), callGetRSOStats: vi.fn() }));

const pushFacts = vi.hoisted(() => vi.fn());
vi.mock('../../services/linkedRoles.js', () => ({
  pushFacts, clearFacts: vi.fn(), registerMetadata: vi.fn(),
  isConfigured: () => true, METADATA_SCHEMA: [], PLATFORM_NAME: 'VIA',
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');
const admin = `via_token=${signToken({ net_id: 'boss', is_global_admin: 1 })}`;

const post = body => request(app).post('/api/v1/rsos/1/members').set('Cookie', admin).send(body);

describe('POST /api/v1/rsos/:id/members', () => {
  beforeEach(() => {
    addMember.mockReset().mockResolvedValue(undefined);
    inviteUser.mockReset().mockResolvedValue(undefined);
    getUserByNetId.mockReset().mockResolvedValue({ net_id: 'abromb2', full_name: 'A' });
  });

  it('adds someone who already has an account', async () => {
    const res = await post({ netId: 'abromb2' });
    expect(res.status).toBe(201);
    expect(addMember).toHaveBeenCalledWith('abromb2', 1, 'Member');
  });

  /**
   * The point of the change. A board should not have to chase everyone into
   * signing in before it can record who is on it.
   */
  it('adds someone who has never signed in, creating the invitation', async () => {
    getUserByNetId.mockResolvedValue(null);
    const res = await post({ netId: 'newbie' });
    expect(res.status).toBe(201);
    expect(inviteUser).toHaveBeenCalledWith('newbie');
    expect(addMember).toHaveBeenCalledWith('newbie', 1, 'Member');
    expect(res.body.invited).toEqual(['newbie']);
  });

  it('does not re-invite someone who already has an account', async () => {
    await post({ netId: 'abromb2' });
    expect(inviteUser).not.toHaveBeenCalled();
  });

  it('accepts an Illinois address and stores the NetID', async () => {
    getUserByNetId.mockResolvedValue(null);
    await post({ netId: 'Abromb2@illinois.edu' });
    expect(addMember).toHaveBeenCalledWith('abromb2', 1, 'Member');
  });

  it('adds a whole pasted list at once', async () => {
    getUserByNetId.mockResolvedValue(null);
    const res = await post({ netId: 'one, two\nthree@illinois.edu', role: 'Board' });
    expect(res.status).toBe(201);
    expect(addMember.mock.calls.map(c => c[0])).toEqual(['one', 'two', 'three']);
    expect(addMember.mock.calls.every(c => c[2] === 'Board')).toBe(true);
    expect(res.body.added).toBe(3);
  });

  it('reports entries it could not read instead of failing the whole paste', async () => {
    getUserByNetId.mockResolvedValue(null);
    const res = await post({ netId: 'good2, someone@gmail.com' });
    expect(res.status).toBe(201);
    expect(res.body.added).toBe(1);
    expect(res.body.rejected).toEqual(['someone@gmail.com']);
  });

  it('rejects a paste with nothing usable in it', async () => {
    const res = await post({ netId: '@@@' });
    expect(res.status).toBe(400);
    expect(addMember).not.toHaveBeenCalled();
  });

  /**
   * Each name costs a lookup and an insert, so an enormous paste is one
   * request asking for unbounded work. A roster of two hundred is already
   * larger than any RSO on this platform.
   */
  it('refuses a paste larger than any real roster', async () => {
    getUserByNetId.mockResolvedValue(null);
    const huge = Array.from({ length: 201 }, (_, i) => `person${i}`).join('\n');
    const res = await post({ netId: huge });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 200/i);
    expect(addMember).not.toHaveBeenCalled();
  });

  it('accepts a paste at the limit', async () => {
    getUserByNetId.mockResolvedValue(null);
    const many = Array.from({ length: 200 }, (_, i) => `person${i}`).join('\n');
    const res = await post({ netId: many });
    expect(res.status).toBe(201);
    expect(res.body.added).toBe(200);
  });

  it('still requires something to add', async () => {
    expect((await post({})).status).toBe(400);
  });

  it('still refuses an unknown role', async () => {
    expect((await post({ netId: 'abromb2', role: 'Overlord' })).status).toBe(400);
  });
});

/**
 * One of the three linked role facts is whether somebody sits on a board, so
 * the fact has to be refreshed whenever that answer changes. The service
 * passes over a person with no Discord authorization on its own, which is why
 * this can be called for everybody rather than only for the linked.
 */
describe('the linked role facts, when a membership changes', () => {
  beforeEach(() => {
    pushFacts.mockReset().mockResolvedValue({ pushed: true });
    addMember.mockReset().mockResolvedValue(undefined);
    inviteUser.mockReset().mockResolvedValue(undefined);
    getUserByNetId.mockReset().mockResolvedValue({ net_id: 'abromb2', full_name: 'A' });
  });

  it('refreshes them for somebody whose role changed', async () => {
    const res = await post({ netId: 'abromb2', role: 'Editor' });
    expect(res.status).toBe(201);
    expect(pushFacts).toHaveBeenCalledWith('abromb2');
  });

  it('refreshes them for somebody removed', async () => {
    const res = await request(app).delete('/api/v1/rsos/1/members/abromb2').set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(pushFacts).toHaveBeenCalledWith('abromb2');
  });

  it('records the membership anyway when Discord cannot be reached', async () => {
    pushFacts.mockRejectedValue(new Error('Discord is down'));
    const res = await post({ netId: 'abromb2', role: 'Editor' });
    expect(res.status).toBe(201);
    expect(addMember).toHaveBeenCalledWith('abromb2', 1, 'Editor');
  });
});
