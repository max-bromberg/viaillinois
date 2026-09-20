import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));

const rsoDb = vi.hoisted(() => ({
  getUserMemberships: vi.fn(), getMembership: vi.fn(), getAllRsos: vi.fn(), getRsoById: vi.fn(),
  addMember: vi.fn(), removeMember: vi.fn(), createRso: vi.fn(), deleteRso: vi.fn(), updateRso: vi.fn(),
  getPublicOrganizations: vi.fn(), getPublicOrganization: vi.fn(), getPublicEventsForRso: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => rsoDb);

const guildsDb = vi.hoisted(() => ({
  reportBinding: vi.fn(), forgetBinding: vi.fn(),
  getGuildsForRso: vi.fn(), getBinding: vi.fn(),
}));
vi.mock('../../db/queries/discordGuilds.ts', () => guildsDb);

const recordGuildUnbound = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  recordGuildUnbound,
}));

process.env.JWT_SECRET = 'test_secret';
process.env.DISCORD_CLIENT_ID = '1055000000000000000';

const app = (await import('../../app.js')).default;

/** Somebody signed in, carrying the cookie the website signs. */
function asPerson(method, path, netId = 'rgarcia7') {
  const token = jwt.sign({ net_id: netId }, 'test_secret');
  return request(app)[method](path).set('Cookie', [`via_token=${token}`]);
}

const GUILD = '204255221017214977';

beforeEach(() => {
  vi.clearAllMocks();
  rsoDb.getMembership.mockResolvedValue({ role: 'Board' });
  guildsDb.getGuildsForRso.mockResolvedValue([]);
  guildsDb.getBinding.mockResolvedValue({ guild_id: GUILD, rso_id: 4, guild_name: 'IEEE at Illinois' });
});

/**
 * What a board sees about its own Discord server, and how it disconnects one.
 *
 * The binding belongs to the bot and the website reads a mirror of it, so this
 * answers what was last reported rather than asking Discord. Disconnecting is
 * authorized here, by the same requireRSOAdmin the rest of the dashboard uses,
 * written to the mirror so the board sees it at once, and left in the outbox
 * for the bot to apply where it actually lives.
 */
describe('GET /api/v1/rsos/:id/discord', () => {
  it('says no server is connected, and how to connect one', async () => {
    const res = await asPerson('get', '/api/v1/rsos/4/discord');

    expect(res.status).toBe(200);
    expect(res.body.guilds).toEqual([]);
    expect(res.body.install_url).toContain('discord.com');
    expect(res.body.install_url).toContain(process.env.DISCORD_CLIENT_ID);
  });

  it('names the server that is connected', async () => {
    guildsDb.getGuildsForRso.mockResolvedValue([
      { guild_id: GUILD, guild_name: 'IEEE at Illinois', bound_by: '1055', bound_at: '2026-09-01 12:00:00' },
    ]);
    const res = await asPerson('get', '/api/v1/rsos/4/discord');

    expect(res.status).toBe(200);
    expect(res.body.guilds).toHaveLength(1);
    expect(res.body.guilds[0].guild_name).toBe('IEEE at Illinois');
  });

  /** A board's own arrangements are the board's, as the rest of the dashboard is. */
  it('refuses somebody who is not on the board', async () => {
    rsoDb.getMembership.mockResolvedValue({ role: 'Member' });
    const res = await asPerson('get', '/api/v1/rsos/4/discord');
    expect(res.status).toBe(403);
  });

  it('refuses somebody who is not signed in at all', async () => {
    const res = await request(app).get('/api/v1/rsos/4/discord');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/rsos/:id/discord/:guildId', () => {
  it('forgets the server and leaves the bot an instruction to apply it', async () => {
    const res = await asPerson('delete', `/api/v1/rsos/4/discord/${GUILD}`);

    expect(res.status).toBe(204);
    expect(guildsDb.forgetBinding).toHaveBeenCalledWith(GUILD);
    expect(recordGuildUnbound).toHaveBeenCalledWith({ guildId: GUILD, rsoId: 4 });
  });

  /**
   * The mirror says which organization a server belongs to, and a board may
   * only disconnect its own. Without this, somebody on one board could name
   * another organization's server in the path and have the bot apply it.
   */
  it('refuses a server that belongs to another organization', async () => {
    guildsDb.getBinding.mockResolvedValue({ guild_id: GUILD, rso_id: 9, guild_name: 'HKN' });
    const res = await asPerson('delete', `/api/v1/rsos/4/discord/${GUILD}`);

    expect(res.status).toBe(404);
    expect(guildsDb.forgetBinding).not.toHaveBeenCalled();
    expect(recordGuildUnbound).not.toHaveBeenCalled();
  });

  it('refuses a server nothing is bound to', async () => {
    guildsDb.getBinding.mockResolvedValue(null);
    const res = await asPerson('delete', `/api/v1/rsos/4/discord/${GUILD}`);

    expect(res.status).toBe(404);
    expect(recordGuildUnbound).not.toHaveBeenCalled();
  });

  it('refuses somebody who is not on the board', async () => {
    rsoDb.getMembership.mockResolvedValue({ role: 'Member' });
    const res = await asPerson('delete', `/api/v1/rsos/4/discord/${GUILD}`);

    expect(res.status).toBe(403);
    expect(guildsDb.forgetBinding).not.toHaveBeenCalled();
  });

  it('refuses a server identifier that is not a Discord one', async () => {
    const res = await asPerson('delete', '/api/v1/rsos/4/discord/not-a-snowflake');
    expect(res.status).toBe(400);
    expect(guildsDb.forgetBinding).not.toHaveBeenCalled();
  });
});
