import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

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

const optIns = vi.hoisted(() => ({
  getFollowsFor: vi.fn(), setFollow: vi.fn(),
  getRemindersFor: vi.fn(), setReminder: vi.fn(),
  isFollowing: vi.fn(), hasReminder: vi.fn(),
}));
vi.mock('../../db/queries/discordOptIns.ts', () => optIns);

const eventsDb = vi.hoisted(() => ({
  getEventById: vi.fn(), getPublicEvents: vi.fn(), getAllEvents: vi.fn(),
  getPublicEventSitemapEntries: vi.fn(), SITEMAP_PAST_MONTHS: 12,
}));
vi.mock('../../db/queries/events.js', () => eventsDb);

const recordOptInChanged = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  recordOptInChanged,
}));

process.env.JWT_SECRET = 'test_secret';

const app = (await import('../../app.js')).default;

const DISCORD = '204255221017214977';

function asPerson(method, path, netId = 'rgarcia7') {
  const token = jwt.sign({ net_id: netId }, 'test_secret');
  return request(app)[method](path).set('Cookie', [`via_token=${token}`]);
}

beforeEach(() => {
  vi.clearAllMocks();
  linksDb.getLinkByNetId.mockResolvedValue({ discordUserId: DISCORD, netId: 'rgarcia7' });
  optIns.getFollowsFor.mockResolvedValue([{ rso_id: 4 }]);
  optIns.getRemindersFor.mockResolvedValue([{ event_id: 12 }]);
  eventsDb.getEventById.mockResolvedValue({ event_id: 12, is_private: 0, rso_id: 4 });
});

/**
 * Following an organization and asking for a reminder, from the website.
 *
 * Both of these are the bot's to do, because the bot is what sends the
 * message, and both were only ever reachable by typing a command in Discord.
 * Somebody who is signed in here and has linked their Discord account should be
 * able to make the same two choices on the page they are already reading.
 *
 * What the website holds is a mirror of what the bot reported. A choice made
 * here is written to the mirror, so the page answers at once, and to the
 * outbox, so the bot applies it where it lives and sends what it promised.
 */
describe('GET /api/v1/me/notifications', () => {
  it('says what a linked person already chose', async () => {
    const res = await asPerson('get', '/api/v1/me/notifications');

    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(true);
    expect(res.body.following).toEqual([4]);
    expect(res.body.reminders).toEqual([12]);
  });

  /**
   * Somebody signed in without a linked Discord account has made no choices and
   * cannot make any yet. That is an answer rather than a refusal, because the
   * page uses it to decide whether to offer linking.
   */
  it('says plainly that somebody has not linked a Discord account', async () => {
    linksDb.getLinkByNetId.mockResolvedValue(null);
    const res = await asPerson('get', '/api/v1/me/notifications');

    expect(res.status).toBe(200);
    expect(res.body.linked).toBe(false);
    expect(res.body.following).toEqual([]);
  });

  it('refuses somebody who is not signed in', async () => {
    expect((await request(app).get('/api/v1/me/notifications')).status).toBe(401);
  });

  /** What a person follows is theirs, so no shared cache may keep it. */
  it('is nobody else\'s to keep', async () => {
    const res = await asPerson('get', '/api/v1/me/notifications');
    expect(res.headers['cache-control']).toContain('no-store');
  });
});

describe('PUT /api/v1/me/notifications/organizations/:rsoId', () => {
  it('follows an organization, and leaves the bot an instruction', async () => {
    const res = await asPerson('put', '/api/v1/me/notifications/organizations/4')
      .send({ following: true });

    expect(res.status).toBe(204);
    expect(optIns.setFollow).toHaveBeenCalledWith(
      { discordUserId: DISCORD, rsoId: 4, following: true });
    expect(recordOptInChanged).toHaveBeenCalledWith(expect.objectContaining({
      discordUserId: DISCORD, subject: 'rso', subjectId: 4, wanted: true,
    }));
  });

  it('stops following, which is the same path with the other answer', async () => {
    const res = await asPerson('put', '/api/v1/me/notifications/organizations/4')
      .send({ following: false });

    expect(res.status).toBe(204);
    expect(optIns.setFollow).toHaveBeenCalledWith(
      { discordUserId: DISCORD, rsoId: 4, following: false });
  });

  /**
   * Nothing can be followed on behalf of an account that is not linked: there
   * is no Discord account to write to, so the bot would have nowhere to send
   * what was promised.
   */
  it('refuses somebody who has not linked a Discord account', async () => {
    linksDb.getLinkByNetId.mockResolvedValue(null);
    const res = await asPerson('put', '/api/v1/me/notifications/organizations/4')
      .send({ following: true });

    expect(res.status).toBe(409);
    expect(optIns.setFollow).not.toHaveBeenCalled();
  });

  it('refuses a body that does not say which way', async () => {
    const res = await asPerson('put', '/api/v1/me/notifications/organizations/4').send({});
    expect(res.status).toBe(400);
    expect(optIns.setFollow).not.toHaveBeenCalled();
  });

  it('refuses somebody who is not signed in', async () => {
    const res = await request(app)
      .put('/api/v1/me/notifications/organizations/4').send({ following: true });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/v1/me/notifications/events/:eventId', () => {
  it('asks for a reminder, and leaves the bot an instruction', async () => {
    const res = await asPerson('put', '/api/v1/me/notifications/events/12')
      .send({ wanted: true });

    expect(res.status).toBe(204);
    expect(optIns.setReminder).toHaveBeenCalledWith(
      { discordUserId: DISCORD, eventId: 12, wanted: true });
    expect(recordOptInChanged).toHaveBeenCalledWith(expect.objectContaining({
      discordUserId: DISCORD, subject: 'event', subjectId: 12, wanted: true,
    }));
  });

  /**
   * An internal event is shown to the organization's own members and to nobody
   * else, and a reminder about one would carry its title into a direct message.
   * Asking about an event VIA will not show is refused the same way as asking
   * about one that does not exist.
   */
  it('refuses a reminder about an event nobody outside the organization is shown', async () => {
    eventsDb.getEventById.mockResolvedValue({ event_id: 12, is_private: 1, rso_id: 4 });
    const res = await asPerson('put', '/api/v1/me/notifications/events/12')
      .send({ wanted: true });

    expect(res.status).toBe(404);
    expect(optIns.setReminder).not.toHaveBeenCalled();
  });

  it('refuses a reminder about an event that is not there', async () => {
    eventsDb.getEventById.mockResolvedValue(null);
    const res = await asPerson('put', '/api/v1/me/notifications/events/12')
      .send({ wanted: true });

    expect(res.status).toBe(404);
    expect(optIns.setReminder).not.toHaveBeenCalled();
  });

  /** Withdrawing is allowed whatever the event is now, so nobody is stuck. */
  it('lets a reminder be withdrawn even where the event has become internal', async () => {
    eventsDb.getEventById.mockResolvedValue({ event_id: 12, is_private: 1, rso_id: 4 });
    const res = await asPerson('put', '/api/v1/me/notifications/events/12')
      .send({ wanted: false });

    expect(res.status).toBe(204);
    expect(optIns.setReminder).toHaveBeenCalledWith(
      { discordUserId: DISCORD, eventId: 12, wanted: false });
  });
});
