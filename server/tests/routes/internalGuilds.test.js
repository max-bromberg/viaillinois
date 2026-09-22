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
  getPublicOrganizations: vi.fn(), getPublicOrganization: vi.fn(), getPublicEventsForRso: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => rsoDb);

const reads = vi.hoisted(() => ({
  listRsos: vi.fn(), getRso: vi.fn(), getRsoMembers: vi.fn().mockResolvedValue([]),
  listEvents: vi.fn(), countEvents: vi.fn(), listMidterms: vi.fn(),
  searchCourses: vi.fn(), listRoomsInBuilding: vi.fn(), getSectionsOccupying: vi.fn(),
}));
vi.mock('../../db/queries/internalReads.ts', () => reads);

const guildsDb = vi.hoisted(() => ({
  reportBinding: vi.fn(), forgetBinding: vi.fn(),
  getGuildsForRso: vi.fn(), getBinding: vi.fn(),
}));
vi.mock('../../db/queries/discordGuilds.ts', () => guildsDb);

const optInsDb = vi.hoisted(() => ({
  getFollowsFor: vi.fn(), setFollow: vi.fn(), getRemindersFor: vi.fn(),
  setReminder: vi.fn(), isFollowing: vi.fn(), hasReminder: vi.fn(),
  replaceOptInsFor: vi.fn(),
}));
vi.mock('../../db/queries/discordOptIns.ts', () => optInsDb);

vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
}));

const TOKEN = 'f'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;
process.env.CLIENT_URL = 'https://viaillinois.com';

const app = (await import('../../app.js')).default;

const asBot = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${TOKEN}`);

const GUILD = '204255221017214977';

beforeEach(() => {
  vi.clearAllMocks();
  reads.getRso.mockResolvedValue({ rso_id: 4, name: 'IEEE Student Branch' });
});

/**
 * What the bot says about the servers it is installed in.
 *
 * The binding belongs to the bot: it is a fact about a Discord server, and the
 * website has no account on the bot's database. So the bot reports what it has
 * and the website keeps a mirror, which is the only thing the board's own
 * dashboard can read.
 *
 * These run as the service rather than for a person. The board member who
 * bound the server was authorized when they bound it, by the same
 * requireRSOAdmin the dashboard uses, and this is the bot stating afterwards
 * what came of that, in the way it states everything else it has.
 */
describe('PUT /internal/v1/guilds/:guildId/binding', () => {
  it('records what the bot reports about a server', async () => {
    const res = await asBot('put', `/internal/v1/guilds/${GUILD}/binding`)
      .send({ rso_id: 4, guild_name: 'IEEE at Illinois', bound_by: '1055', bound_at: '2026-09-01 12:00:00' });

    expect(res.status).toBe(204);
    expect(guildsDb.reportBinding).toHaveBeenCalledWith({
      guildId: GUILD,
      rsoId: 4,
      guildName: 'IEEE at Illinois',
      boundBy: '1055',
      boundAt: '2026-09-01 12:00:00',
    });
  });

  it('refuses an organization identifier that is not one', async () => {
    const res = await asBot('put', `/internal/v1/guilds/${GUILD}/binding`)
      .send({ rso_id: 'the ieee one' });

    expect(res.status).toBe(400);
    expect(guildsDb.reportBinding).not.toHaveBeenCalled();
  });

  it('refuses a server identifier that is not a Discord one', async () => {
    const res = await asBot('put', '/internal/v1/guilds/not-a-snowflake/binding')
      .send({ rso_id: 4 });

    expect(res.status).toBe(400);
    expect(guildsDb.reportBinding).not.toHaveBeenCalled();
  });

  /** A binding to an organization that is not there would be a row pointing at nothing. */
  it('refuses a binding to an organization VIA has no record of', async () => {
    reads.getRso.mockResolvedValue(null);
    const res = await asBot('put', `/internal/v1/guilds/${GUILD}/binding`).send({ rso_id: 99 });

    expect(res.status).toBe(404);
    expect(guildsDb.reportBinding).not.toHaveBeenCalled();
  });

  it('is refused without the service token, as everything internal is', async () => {
    const res = await request(app)
      .put(`/internal/v1/guilds/${GUILD}/binding`).send({ rso_id: 4 });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /internal/v1/guilds/:guildId/binding', () => {
  it('forgets a server the bot says is no longer bound', async () => {
    const res = await asBot('delete', `/internal/v1/guilds/${GUILD}/binding`);
    expect(res.status).toBe(204);
    expect(guildsDb.forgetBinding).toHaveBeenCalledWith(GUILD);
  });

  /**
   * The bot may report the same removal twice, because it reports what it has
   * rather than what changed. Both times the answer is that nothing is bound.
   */
  it('answers the same way when there was nothing to forget', async () => {
    const res = await asBot('delete', `/internal/v1/guilds/${GUILD}/binding`);
    expect(res.status).toBe(204);
  });

  it('refuses a server identifier that is not a Discord one', async () => {
    const res = await asBot('delete', '/internal/v1/guilds/not-a-snowflake/binding');
    expect(res.status).toBe(400);
    expect(guildsDb.forgetBinding).not.toHaveBeenCalled();
  });
});

/**
 * What the bot says a person asked to be told about.
 *
 * The same two choices can be made in Discord, with the follow command and the
 * reminder button, and the website would show stale answers if it only ever
 * wrote its own. So the bot reports the whole of what it holds for one account
 * and the mirror is replaced with it, which is the same shape as every other
 * report: the state rather than the change.
 */
describe('PUT /internal/v1/optins/:discordUserId', () => {
  const PERSON = '305255221017214977';

  it('replaces what the website holds for that person', async () => {
    const res = await asBot('put', `/internal/v1/optins/${PERSON}`)
      .send({ following: [4, 9], reminders: [12] });

    expect(res.status).toBe(204);
    expect(optInsDb.replaceOptInsFor).toHaveBeenCalledWith({
      discordUserId: PERSON, following: [4, 9], reminders: [12],
    });
  });

  /** Somebody who follows nothing is an answer, and it empties the mirror. */
  it('takes an empty report as meaning they chose nothing', async () => {
    const res = await asBot('put', `/internal/v1/optins/${PERSON}`)
      .send({ following: [], reminders: [] });

    expect(res.status).toBe(204);
    expect(optInsDb.replaceOptInsFor).toHaveBeenCalledWith({
      discordUserId: PERSON, following: [], reminders: [],
    });
  });

  it('refuses a person identifier that is not a Discord one', async () => {
    const res = await asBot('put', '/internal/v1/optins/not-a-snowflake')
      .send({ following: [], reminders: [] });

    expect(res.status).toBe(400);
    expect(optInsDb.replaceOptInsFor).not.toHaveBeenCalled();
  });

  /** A list that is not a list of identifiers is a mistake worth refusing. */
  it('refuses a report whose lists are not lists of identifiers', async () => {
    const res = await asBot('put', `/internal/v1/optins/${PERSON}`)
      .send({ following: ['the ieee one'], reminders: [] });

    expect(res.status).toBe(400);
    expect(optInsDb.replaceOptInsFor).not.toHaveBeenCalled();
  });

  it('is refused without the service token, as everything internal is', async () => {
    const res = await request(app).put(`/internal/v1/optins/${PERSON}`).send({});
    expect(res.status).toBe(401);
  });
});
