import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));

const linksDb = vi.hoisted(() => ({
  getLinkByDiscordUserId: vi.fn(), getLinkByNetId: vi.fn(), getLinkWithMemberships: vi.fn(),
  openLinkSession: vi.fn(), getLinkSession: vi.fn(), completeLinkSession: vi.fn(),
  linkAccount: vi.fn(), setLinkAuthorization: vi.fn(),
  deleteLinkByDiscordUserId: vi.fn(), deleteLinkByNetId: vi.fn(),
  SESSION_MINUTES: 10,
}));
vi.mock('../../db/queries/discordLinks.ts', () => linksDb);

vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const rsoDb = vi.hoisted(() => ({
  getUserMemberships: vi.fn(), getMembership: vi.fn(), getAllRsos: vi.fn(), getRsoById: vi.fn(),
  addMember: vi.fn(), removeMember: vi.fn(), createRso: vi.fn(), deleteRso: vi.fn(), updateRso: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => rsoDb);

const reads = vi.hoisted(() => ({
  listRsos: vi.fn(), getRso: vi.fn(), getRsoMembers: vi.fn().mockResolvedValue([]),
  listEvents: vi.fn(), countEvents: vi.fn(), listMidterms: vi.fn(),
  searchCourses: vi.fn(), listRoomsInBuilding: vi.fn(), getSectionsOccupying: vi.fn(),
}));
vi.mock('../../db/queries/internalReads.ts', () => reads);

const recordLinkRevoked = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  recordLinkRevoked,
}));

const clearFacts = vi.hoisted(() => vi.fn());
vi.mock('../../services/linkedRoles.js', () => ({
  clearFacts, pushFacts: vi.fn(), registerMetadata: vi.fn(), isConfigured: () => true,
  METADATA_SCHEMA: [], PLATFORM_NAME: 'VIA',
}));

const TOKEN = 'f'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;
process.env.CLIENT_URL = 'https://viaillinois.com';

const app = (await import('../../app.js')).default;

const asBot = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${TOKEN}`);
const acting = (method, path, discordUserId = '123456789012345678') =>
  asBot(method, path).set('X-Via-Acting-Discord-User', discordUserId);

const LINK = {
  discord_user_id: '204255221017214977', net_id: 'rgarcia7', display_name: 'Rosa Garcia',
  is_global_admin: false, linked_at: '2026-09-04 18:32:11',
  memberships: [
    { rso_id: 4, rso_name: 'IEEE Student Branch', role: 'Board' },
    { rso_id: 9, rso_name: 'HKN', role: 'Member' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  linksDb.getLinkByDiscordUserId.mockResolvedValue({ netId: 'rgarcia7', isGlobalAdmin: 0 });
  linksDb.openLinkSession.mockResolvedValue({
    sessionId: 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT', expiresAt: '2026-09-04 18:40:00',
  });
  linksDb.getLinkWithMemberships.mockResolvedValue(LINK);
  linksDb.deleteLinkByDiscordUserId.mockResolvedValue({
    discordUserId: '204255221017214977', netId: 'rgarcia7',
  });
  rsoDb.getMembership.mockResolvedValue({ role: 'Board' });
  reads.getRso.mockResolvedValue({
    rso_id: 4, name: 'IEEE Student Branch', description: 'The student branch.', logo_color: '#13294B',
  });
  reads.getRsoMembers.mockResolvedValue([]);
});

/**
 * The endpoints the link flow and the account lookup are made of.
 *
 * The bot never decides who anybody is. It observes a Discord account asking
 * to link, opens a session here, and sends the person to the address this
 * answers with. Everything after that happens on the website, where the person
 * signs in with their own NetID.
 */
describe('POST /internal/v1/links/sessions', () => {
  it('opens a session and answers with the address and the expiry', async () => {
    const res = await asBot('post', '/internal/v1/links/sessions')
      .send({ discord_user_id: '204255221017214977' });
    expect(res.status).toBe(201);
    expect(linksDb.openLinkSession).toHaveBeenCalledWith({ discordUserId: '204255221017214977' });
    expect(res.body).toEqual({
      session_id: 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT',
      address: 'https://viaillinois.com/link/discord/hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT',
      expires_at: '2026-09-04T18:40:00-05:00',
    });
  });

  it('refuses a Discord identifier that is not a snowflake', async () => {
    for (const value of ['', 'alice', '12345678901234567890123456789012345', 12345, null]) {
      const res = await asBot('post', '/internal/v1/links/sessions').send({ discord_user_id: value });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid');
    }
    expect(linksDb.openLinkSession).not.toHaveBeenCalled();
  });

  it('needs the service token like everything else', async () => {
    const res = await request(app).post('/internal/v1/links/sessions')
      .send({ discord_user_id: '204255221017214977' });
    expect(res.status).toBe(401);
  });
});

describe('GET /internal/v1/links/{discordUserId}', () => {
  it('answers who the account is, with their memberships', async () => {
    const res = await asBot('get', '/internal/v1/links/204255221017214977');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      discord_user_id: '204255221017214977',
      net_id: 'rgarcia7',
      display_name: 'Rosa Garcia',
      is_global_admin: false,
      linked_at: '2026-09-04T18:32:11-05:00',
      memberships: [
        { rso_id: 4, rso_name: 'IEEE Student Branch', role: 'Board' },
        { rso_id: 9, rso_name: 'HKN', role: 'Member' },
      ],
    });
  });

  it('answers 404 with the not found code when nobody linked that account', async () => {
    linksDb.getLinkWithMemberships.mockResolvedValue(null);
    const res = await asBot('get', '/internal/v1/links/999999999999999999');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: expect.any(String), code: 'not_found' });
  });

  it('refuses an identifier that is not a snowflake', async () => {
    const res = await asBot('get', '/internal/v1/links/not-a-snowflake');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });
});

describe('DELETE /internal/v1/links/{discordUserId}', () => {
  it('removes the link, clears the facts and writes link.revoked', async () => {
    const res = await asBot('delete', '/internal/v1/links/204255221017214977');
    expect(res.status).toBe(204);
    expect(clearFacts).toHaveBeenCalledWith('rgarcia7');
    expect(linksDb.deleteLinkByDiscordUserId).toHaveBeenCalledWith('204255221017214977');
    expect(recordLinkRevoked).toHaveBeenCalledWith({
      discordUserId: '204255221017214977', netId: 'rgarcia7',
    });
  });

  it('clears the facts before the row it needs is gone', async () => {
    const order = [];
    clearFacts.mockImplementation(async () => { order.push('cleared'); });
    linksDb.deleteLinkByDiscordUserId.mockImplementation(async () => {
      order.push('deleted');
      return { discordUserId: '204255221017214977', netId: 'rgarcia7' };
    });
    await asBot('delete', '/internal/v1/links/204255221017214977');
    expect(order).toEqual(['cleared', 'deleted']);
  });

  it('unlinks anyway when clearing the facts on Discord fails', async () => {
    clearFacts.mockRejectedValue(new Error('Discord is down'));
    const res = await asBot('delete', '/internal/v1/links/204255221017214977');
    expect(res.status).toBe(204);
    expect(recordLinkRevoked).toHaveBeenCalled();
  });

  it('answers 404 and writes nothing when there was no link', async () => {
    linksDb.deleteLinkByDiscordUserId.mockResolvedValue(null);
    linksDb.getLinkByDiscordUserId.mockResolvedValue(null);
    const res = await asBot('delete', '/internal/v1/links/999999999999999999');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
    expect(recordLinkRevoked).not.toHaveBeenCalled();
  });
});

/**
 * Binding a server to an RSO is a decision about that RSO, so the web platform
 * decides it with the same middleware the dashboard uses. The bot asks, and
 * stores the binding itself only once this answers.
 */
describe('POST /internal/v1/guilds/bindings/confirm', () => {
  it('confirms for a board member of that RSO', async () => {
    const res = await acting('post', '/internal/v1/guilds/bindings/confirm').send({ rso_id: 4 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, rso: { rso_id: 4, name: 'IEEE Student Branch' } });
    expect(rsoDb.getMembership).toHaveBeenCalledWith('rgarcia7', 4);
  });

  it('refuses somebody who is not on that board, with a code', async () => {
    rsoDb.getMembership.mockResolvedValue({ role: 'Member' });
    const res = await acting('post', '/internal/v1/guilds/bindings/confirm').send({ rso_id: 4 });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: expect.any(String), code: 'forbidden' });
  });

  it('confirms for a global administrator who is on no board', async () => {
    linksDb.getLinkByDiscordUserId.mockResolvedValue({ netId: 'root', isGlobalAdmin: 1 });
    rsoDb.getMembership.mockResolvedValue(null);
    const res = await acting('post', '/internal/v1/guilds/bindings/confirm').send({ rso_id: 4 });
    expect(res.status).toBe(200);
  });

  it('refuses a request with no acting person', async () => {
    const res = await asBot('post', '/internal/v1/guilds/bindings/confirm').send({ rso_id: 4 });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('refuses a Discord account nobody linked', async () => {
    linksDb.getLinkByDiscordUserId.mockResolvedValue(null);
    const res = await acting('post', '/internal/v1/guilds/bindings/confirm').send({ rso_id: 4 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_linked');
  });

  it('refuses a body with no RSO in it', async () => {
    const res = await acting('post', '/internal/v1/guilds/bindings/confirm').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  it('answers 404 for an RSO that does not exist', async () => {
    reads.getRso.mockResolvedValue(null);
    const res = await acting('post', '/internal/v1/guilds/bindings/confirm').send({ rso_id: 77 });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('leaves the identifier a route reads from the path alone', async () => {
    // requireRSOAdmin reads req.params, and this endpoint has to give it the
    // identifier from the body without changing what it reads anywhere else.
    const res = await acting('get', '/internal/v1/rsos/9/members');
    expect(res.status).toBe(200);
    expect(rsoDb.getMembership).toHaveBeenCalledWith('rgarcia7', 9);
  });
});
