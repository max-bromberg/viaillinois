import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));

const usersDb = vi.hoisted(() => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(), inviteUser: vi.fn(),
}));
vi.mock('../../db/queries/users.js', () => usersDb);

const rsoDb = vi.hoisted(() => ({
  getUserMemberships: vi.fn(), getMembership: vi.fn(), getAllRsos: vi.fn(), getRsoById: vi.fn(),
  addMember: vi.fn(), removeMember: vi.fn(), createRso: vi.fn(), deleteRso: vi.fn(), updateRso: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => rsoDb);

const linksDb = vi.hoisted(() => ({
  getLinkByDiscordUserId: vi.fn(), getLinkByNetId: vi.fn(), getLinkWithMemberships: vi.fn(),
  openLinkSession: vi.fn(), getLinkSession: vi.fn(), completeLinkSession: vi.fn(),
  linkAccount: vi.fn(), setLinkAuthorization: vi.fn(),
  deleteLinkByDiscordUserId: vi.fn(), deleteLinkByNetId: vi.fn(),
  SESSION_MINUTES: 10,
}));
vi.mock('../../db/queries/discordLinks.ts', () => linksDb);

const recordLinkRevoked = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  recordLinkRevoked,
}));

const clearFacts = vi.hoisted(() => vi.fn());
vi.mock('../../services/linkedRoles.js', () => ({
  clearFacts, pushFacts: vi.fn(), registerMetadata: vi.fn(),
  isConfigured: () => true, METADATA_SCHEMA: [], PLATFORM_NAME: 'VIA',
}));

process.env.JWT_SECRET = 'a-test-secret';

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');

const asRosa = req => req.set('Cookie', [`via_token=${signToken({ net_id: 'rgarcia7', is_global_admin: false })}`]);

beforeEach(() => {
  vi.clearAllMocks();
  usersDb.getUserByNetId.mockResolvedValue({
    net_id: 'rgarcia7', full_name: 'Rosa Garcia', email: 'rgarcia7@illinois.edu', is_global_admin: 0,
  });
  rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 4, name: 'IEEE Student Branch', role: 'Board' }]);
  linksDb.getLinkByNetId.mockResolvedValue({
    discordUserId: '204255221017214977', netId: 'rgarcia7',
    linkedAt: '2026-09-04 18:32:11', authorization: null,
  });
  linksDb.deleteLinkByNetId.mockResolvedValue({
    discordUserId: '204255221017214977', netId: 'rgarcia7',
  });
});

/**
 * The account area on the website.
 *
 * A person who linked from Discord has to be able to see it and undo it here,
 * without going back to Discord to do so, and without the page ever being told
 * which Discord account it is: the person already knows, and the identifier is
 * of no use to the browser.
 */
describe('GET /api/v1/users/me', () => {
  it('says whether a Discord account is linked, and when it was', async () => {
    const res = await asRosa(request(app).get('/api/v1/users/me'));
    expect(res.status).toBe(200);
    expect(res.body.user.discord).toEqual({
      linked: true, linked_at: '2026-09-04T18:32:11-05:00', roles_published: false,
    });
  });

  it('says so plainly when no Discord account is linked', async () => {
    linksDb.getLinkByNetId.mockResolvedValue(null);
    const res = await asRosa(request(app).get('/api/v1/users/me'));
    expect(res.body.user.discord).toEqual({
      linked: false, linked_at: null, roles_published: false,
    });
  });

  /**
   * The linked roles step is optional and can be added later, so the account
   * page has to be able to tell whether it was taken. What is held is the
   * sealed Discord authorization, and the browser is told only that one exists.
   */
  it('says the linked roles facts are published when an authorization is held', async () => {
    linksDb.getLinkByNetId.mockResolvedValue({
      discordUserId: '204255221017214977', netId: 'rgarcia7',
      linkedAt: '2026-09-04 18:32:11', authorization: Buffer.from([1, 2, 3]),
    });
    const res = await asRosa(request(app).get('/api/v1/users/me'));
    expect(res.body.user.discord.roles_published).toBe(true);
  });

  it('never publishes the authorization itself to the browser', async () => {
    linksDb.getLinkByNetId.mockResolvedValue({
      discordUserId: '204255221017214977', netId: 'rgarcia7',
      linkedAt: '2026-09-04 18:32:11', authorization: Buffer.from('a-refresh-token'),
    });
    const res = await asRosa(request(app).get('/api/v1/users/me'));
    expect(JSON.stringify(res.body)).not.toContain('refresh');
    expect(Object.keys(res.body.user.discord).sort())
      .toEqual(['linked', 'linked_at', 'roles_published']);
  });

  it('does not publish the Discord identifier to the browser', async () => {
    const res = await asRosa(request(app).get('/api/v1/users/me'));
    expect(JSON.stringify(res.body)).not.toContain('204255221017214977');
  });

  it('still answers the person when the link cannot be read', async () => {
    linksDb.getLinkByNetId.mockRejectedValue(new Error('the database is away'));
    const res = await asRosa(request(app).get('/api/v1/users/me'));
    expect(res.status).toBe(200);
    expect(res.body.user.discord).toEqual({
      linked: false, linked_at: null, roles_published: false,
    });
  });
});

describe('DELETE /api/v1/users/me/discord', () => {
  it('unlinks, clears the facts and writes link.revoked', async () => {
    const res = await asRosa(request(app).delete('/api/v1/users/me/discord'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(clearFacts).toHaveBeenCalledWith('rgarcia7');
    expect(linksDb.deleteLinkByNetId).toHaveBeenCalledWith('rgarcia7');
    expect(recordLinkRevoked).toHaveBeenCalledWith({
      discordUserId: '204255221017214977', netId: 'rgarcia7',
    });
  });

  it('unlinks anyway when clearing the facts on Discord fails', async () => {
    clearFacts.mockRejectedValue(new Error('Discord is down'));
    const res = await asRosa(request(app).delete('/api/v1/users/me/discord'));
    expect(res.status).toBe(200);
    expect(recordLinkRevoked).toHaveBeenCalled();
  });

  it('answers 404 when there was nothing linked', async () => {
    linksDb.getLinkByNetId.mockResolvedValue(null);
    linksDb.deleteLinkByNetId.mockResolvedValue(null);
    const res = await asRosa(request(app).delete('/api/v1/users/me/discord'));
    expect(res.status).toBe(404);
    expect(recordLinkRevoked).not.toHaveBeenCalled();
  });

  it('needs somebody signed in', async () => {
    const res = await request(app).delete('/api/v1/users/me/discord');
    expect(res.status).toBe(401);
    expect(linksDb.deleteLinkByNetId).not.toHaveBeenCalled();
  });
});
