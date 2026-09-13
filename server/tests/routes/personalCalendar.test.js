import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
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

const calendarsDb = vi.hoisted(() => ({
  rotateCalendar: vi.fn(), setCalendarRsos: vi.fn(), getCalendarByTokenHash: vi.fn(),
}));
vi.mock('../../db/queries/personalCalendars.ts', () => calendarsDb);

const reads = vi.hoisted(() => ({
  listRsos: vi.fn(), getRso: vi.fn(), getRsoMembers: vi.fn(),
  listEvents: vi.fn(), countEvents: vi.fn(), listMidterms: vi.fn(),
  searchCourses: vi.fn(), listRoomsInBuilding: vi.fn(), getSectionsOccupying: vi.fn(),
}));
vi.mock('../../db/queries/internalReads.ts', () => reads);

vi.mock('../../db/queries/outbox.ts', async () =>
  (await import('../support/outboxMock.js')).outboxMock());

vi.mock('../../services/linkedRoles.js', () => ({
  clearFacts: vi.fn(), pushFacts: vi.fn(), registerMetadata: vi.fn(),
  isConfigured: () => true, METADATA_SCHEMA: [], PLATFORM_NAME: 'VIA',
}));

const TOKEN = 'b'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;
process.env.CLIENT_URL = 'https://viaillinois.com';

const app = (await import('../../app.js')).default;

const LINKED = '204255221017214977';
const asBot = (method, path) => request(app)[method](path).set('Authorization', `Bearer ${TOKEN}`);
const acting = (method, path) => asBot(method, path).set('X-Via-Acting-Discord-User', LINKED);

const EVENT_ROW = {
  event_id: 10, rso_id: 4, rso_name: 'IEEE Student Branch', title: 'General meeting',
  description: 'Bring a laptop.', start_time: '2026-09-10 18:00:00', end_time: '2026-09-10 19:00:00',
  is_private: 0, cancelled_at: null, location_id: 5, building: 'Electrical & Computer Eng Bldg',
  room_number: '1002', location_text: null, location_note: null, interest_count: 0,
};

const sha256 = value => createHash('sha256').update(value).digest('hex');

/** The token out of the address the endpoint answered with. */
const tokenIn = address => address.replace(/^.*\/calendar\/personal\//, '').replace(/\.ics$/, '');

beforeEach(() => {
  vi.clearAllMocks();
  linksDb.getLinkByDiscordUserId.mockResolvedValue({ netId: 'rgarcia7', isGlobalAdmin: 0 });
  calendarsDb.rotateCalendar.mockResolvedValue({ rotatedAt: '2026-09-05 12:00:00' });
  calendarsDb.setCalendarRsos.mockResolvedValue(1);
  calendarsDb.getCalendarByTokenHash.mockResolvedValue({ netId: 'rgarcia7', rsoIds: [4] });
  reads.listEvents.mockResolvedValue([EVENT_ROW]);
});

/**
 * A subscription a phone can hold, guarded by a token and nothing else.
 *
 * The address is the whole of the credential, so it is stored only as a hash,
 * a person can throw it away by asking for a new one, and the calendar it
 * answers holds nothing an internal event would give away.
 */
describe('POST /internal/v1/calendars/personal', () => {
  it('answers with an address the person can subscribe to', async () => {
    const res = await acting('post', '/internal/v1/calendars/personal').send({ rso_ids: [4, 9] });
    expect(res.status).toBe(200);
    expect(res.body.address).toMatch(
      /^https:\/\/viaillinois\.com\/calendar\/personal\/[A-Za-z0-9_-]{43}\.ics$/
    );
    expect(res.body.rotated_at).toBe('2026-09-05T12:00:00-05:00');
  });

  it('stores the hash of the token and never the token', async () => {
    const res = await acting('post', '/internal/v1/calendars/personal').send({ rso_ids: null });
    const token = tokenIn(res.body.address);
    expect(calendarsDb.rotateCalendar).toHaveBeenCalledWith({
      netId: 'rgarcia7', tokenHash: sha256(token), rsoIds: null,
    });
    expect(calendarsDb.rotateCalendar.mock.calls[0][0].tokenHash).not.toBe(token);
  });

  it('gives a different address every time, so the one before it is gone', async () => {
    const first = await acting('post', '/internal/v1/calendars/personal').send({ rso_ids: null });
    const second = await acting('post', '/internal/v1/calendars/personal').send({ rso_ids: null });
    expect(second.body.address).not.toBe(first.body.address);

    // The old address answers nothing, because the row now holds the new hash.
    calendarsDb.getCalendarByTokenHash.mockImplementation(async hash =>
      (hash === sha256(tokenIn(second.body.address)) ? { netId: 'rgarcia7', rsoIds: null } : null));
    expect((await request(app).get(`/calendar/personal/${tokenIn(first.body.address)}.ics`)).status).toBe(404);
    expect((await request(app).get(`/calendar/personal/${tokenIn(second.body.address)}.ics`)).status).toBe(200);
  });

  /**
   * An empty list is a choice, and it is not the same choice as having made
   * none. Somebody who unticks every organization has asked for a calendar
   * with nothing in it, and answering that with every event on campus is the
   * opposite of what they asked for.
   */
  it('keeps an empty list as an empty list rather than reading it as every organization', async () => {
    const res = await acting('post', '/internal/v1/calendars/personal').send({ rso_ids: [] });
    expect(res.status).toBe(200);
    expect(calendarsDb.rotateCalendar).toHaveBeenCalledWith(
      expect.objectContaining({ rsoIds: [] }));
  });

  it('refuses an RSO set that is not a list of whole numbers', async () => {
    for (const rso_ids of [['four'], [0], [1.5], 4, {}]) {
      const res = await acting('post', '/internal/v1/calendars/personal').send({ rso_ids });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid');
    }
    expect(calendarsDb.rotateCalendar).not.toHaveBeenCalled();
  });

  it('refuses a request that acts as nobody', async () => {
    const res = await asBot('post', '/internal/v1/calendars/personal').send({ rso_ids: null });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('refuses a Discord account nobody linked', async () => {
    linksDb.getLinkByDiscordUserId.mockResolvedValue(null);
    const res = await acting('post', '/internal/v1/calendars/personal').send({ rso_ids: null });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_linked');
  });
});

describe('PUT /internal/v1/calendars/personal/rsos', () => {
  it('changes which RSOs the calendar follows without changing the address', async () => {
    const res = await acting('put', '/internal/v1/calendars/personal/rsos').send({ rso_ids: [4] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, rso_ids: [4] });
    expect(calendarsDb.setCalendarRsos).toHaveBeenCalledWith({ netId: 'rgarcia7', rsoIds: [4] });
    expect(calendarsDb.rotateCalendar).not.toHaveBeenCalled();
  });

  it('empties a calendar when the person unticked every organization', async () => {
    const res = await acting('put', '/internal/v1/calendars/personal/rsos').send({ rso_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, rso_ids: [] });
    expect(calendarsDb.setCalendarRsos).toHaveBeenCalledWith({ netId: 'rgarcia7', rsoIds: [] });
  });

  it('answers 404 for somebody who has no calendar yet', async () => {
    calendarsDb.setCalendarRsos.mockResolvedValue(0);
    const res = await acting('put', '/internal/v1/calendars/personal/rsos').send({ rso_ids: null });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('refuses a request that acts as nobody', async () => {
    const res = await asBot('put', '/internal/v1/calendars/personal/rsos').send({ rso_ids: null });
    expect(res.status).toBe(401);
  });
});

describe('GET /calendar/personal/{token}.ics', () => {
  const address = token => `/calendar/personal/${token}.ics`;
  const GOOD = 'k'.repeat(43);

  beforeEach(() => {
    calendarsDb.getCalendarByTokenHash.mockImplementation(async hash =>
      (hash === sha256(GOOD) ? { netId: 'rgarcia7', rsoIds: [4] } : null));
  });

  it('answers the followed RSOs upcoming events as a calendar file', async () => {
    const res = await request(app).get(address(GOOD));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('SUMMARY:General meeting');
    expect(reads.listEvents).toHaveBeenCalledWith(expect.objectContaining({
      rsoIds: [4], timeframe: 'upcoming', privateRsoIds: [],
    }));
  });

  it('carries every RSO when the person follows all of them', async () => {
    calendarsDb.getCalendarByTokenHash.mockResolvedValue({ netId: 'rgarcia7', rsoIds: null });
    await request(app).get(address(GOOD));
    expect(reads.listEvents).toHaveBeenCalledWith(expect.objectContaining({ rsoIds: [] }));
  });

  it('answers a calendar that follows nothing with a file that holds nothing', async () => {
    calendarsDb.getCalendarByTokenHash.mockResolvedValue({ netId: 'rgarcia7', rsoIds: [] });
    const res = await request(app).get(address(GOOD));
    expect(res.status).toBe(200);
    expect(reads.listEvents).not.toHaveBeenCalled();
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).not.toContain('BEGIN:VEVENT');
  });

  it('is not for a shared cache to keep', async () => {
    const res = await request(app).get(address(GOOD));
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('answers an unknown token with 404 and nothing else', async () => {
    const res = await request(app).get(address('z'.repeat(43)));
    expect(res.status).toBe(404);
    expect(res.text).toBe('Not found');
    expect(res.headers['content-type']).toContain('text/plain');
    expect(reads.listEvents).not.toHaveBeenCalled();
  });

  it('answers a token of the wrong shape without asking the database', async () => {
    for (const token of ['short', 'not/a/token', '']) {
      const res = await request(app).get(address(token));
      expect(res.status).toBe(404);
    }
    expect(calendarsDb.getCalendarByTokenHash).not.toHaveBeenCalled();
  });

  it('answers nothing for an address that is not a calendar file', async () => {
    const res = await request(app).get(`/calendar/personal/${GOOD}`);
    expect(res.status).toBe(404);
  });
});
