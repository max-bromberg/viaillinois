import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
const getLinkByDiscordUserId = linksDb.getLinkByDiscordUserId;
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const reads = vi.hoisted(() => ({
  listRsos: vi.fn(), getRso: vi.fn(), getRsoMembers: vi.fn(),
  listEvents: vi.fn(), countEvents: vi.fn(), listMidterms: vi.fn(),
  searchCourses: vi.fn(), listRoomsInBuilding: vi.fn(), getSectionsOccupying: vi.fn(),
}));
vi.mock('../../db/queries/internalReads.ts', () => reads);

const eventsDb = vi.hoisted(() => ({
  getEventById: vi.fn(), getPublicEvents: vi.fn(), countPublicEvents: vi.fn(),
  getAllEvents: vi.fn(), countAllEvents: vi.fn(), getVisibleEvents: vi.fn(), countVisibleEvents: vi.fn(),
  getEventsByRso: vi.fn(), getKioskEvents: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), setEventTags: vi.fn(), findEventsByUid: vi.fn(),
  TIMEFRAMES: ['upcoming', 'archived', 'all'],
}));
vi.mock('../../db/queries/events.js', () => eventsDb);

const rsoDb = vi.hoisted(() => ({
  getUserMemberships: vi.fn(), getMembership: vi.fn(), getAllRsos: vi.fn(), getRsoById: vi.fn(),
  addMember: vi.fn(), removeMember: vi.fn(), createRso: vi.fn(), deleteRso: vi.fn(), updateRso: vi.fn(),
}));
vi.mock('../../db/queries/rso.js', () => rsoDb);

const searchLocations = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/locations.js', () => ({
  searchLocations, getOccupiedDuring: vi.fn(), upsertLocation: vi.fn(), getByCapacity: vi.fn(),
  allLocations: vi.fn(), getById: vi.fn(), clearLocationCache: vi.fn(),
}));

const getSectionsForCourses = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/courses.js', () => ({
  getSectionsForCourses, getCourses: vi.fn(), getCourseCodes: vi.fn(),
  getSectionsByCourse: vi.fn(), upsertCourse: vi.fn(), upsertSection: vi.fn(),
}));

const occupiedLocationIds = vi.hoisted(() => vi.fn());
vi.mock('../../services/conflictDetector.js', () => ({
  occupiedLocationIds, checkConflict: vi.fn(),
}));

const readOutbox = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  readOutbox,
}));

vi.mock('../../services/linkedRoles.js', () => ({
  clearFacts: vi.fn(), pushFacts: vi.fn(), registerMetadata: vi.fn(),
  isConfigured: () => true, METADATA_SCHEMA: [], PLATFORM_NAME: 'VIA',
}));

const TOKEN = 'e'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;
// The address in a link session is built from where the website is served, and
// the recorded shape is the one the bot's repository copies, so the fixture is
// taken against the address the platform actually runs at.
process.env.CLIENT_URL = 'https://viaillinois.com';

const app = (await import('../../app.js')).default;
const { presentEvent } = await import('../../lib/eventShape.js');

/**
 * The answer shapes of the internal service API, written down.
 *
 * The Discord bot's repository copies these files and serves them from its
 * fake web platform, so they are the contract between the two repositories. A
 * change to any shape shows up here as a change to a committed file, which is
 * a thing a reviewer can see, rather than as a bot that quietly stops finding
 * a field. Run the suite with UPDATE_FIXTURES=1 to write the files after a
 * deliberate change, and commit what changed.
 */
const FIXTURES = fileURLToPath(new URL('../fixtures/internal/', import.meta.url));
const UPDATING = process.env.UPDATE_FIXTURES === '1';

function fixture(name, actual) {
  const path = `${FIXTURES}${name}.json`;
  const serialised = `${JSON.stringify(actual, null, 2)}\n`;
  if (UPDATING) {
    mkdirSync(FIXTURES, { recursive: true });
    writeFileSync(path, serialised);
    return;
  }
  expect(existsSync(path), `${name}.json is missing. Run the suite with UPDATE_FIXTURES=1 to write it.`).toBe(true);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(actual);
}

const RSO = { rso_id: 1, name: 'IEEE', description: 'The student branch at Illinois.', logo_color: '#13294B' };

const EVENT_ROW = {
  event_id: 10, rso_id: 1, rso_name: 'IEEE', title: 'General meeting',
  description: 'Bring a laptop.', start_time: '2026-09-10 18:00:00', end_time: '2026-09-10 19:00:00',
  is_private: 0, cancelled_at: null, location_id: 5, building: 'Electrical & Computer Eng Bldg',
  room_number: '1002', location_text: null, location_note: 'Use the north entrance.',
  series_id: 4, series_frequency: 'weekly', series_interval_weeks: 1,
  series_days_of_week: 'MO,WE', series_ends_on: '2026-12-09', interest_count: 3,
};

const ROOM = {
  location_id: 5, building: 'Electrical & Computer Eng Bldg', room_number: '1002',
  max_capacity: 40, has_av_equipment: 1,
};

const SECTION = {
  section_id: 1, course_code: 'ECE 385', day_of_week: 'MW', start_time: '10:00:00',
  end_time: '11:20:00', semester: 'fall', section_type: 'lecture',
  building: 'Electrical & Computer Eng Bldg', room_number: '1002',
};

/**
 * One outbox entry of every kind the first release writes.
 *
 * The event a change carries is built with the same presenter the reading
 * endpoints use, so an entry and an answer cannot come to hold two different
 * shapes of the same event without this file changing.
 */
const SERIES = {
  series_id: 4, rso_id: 1, frequency: 'weekly', interval_weeks: 1, days_of_week: 'MO,WE',
  starts_on: '2026-09-07', ends_on: '2026-12-09', start_of_day: '18:00:00', duration_minutes: 60,
};

const MIDTERM = {
  midterm_id: 20, course_code: 'ECE 385', course_title: 'Digital Systems Laboratory',
  title: 'Midterm 1', start_time: '2026-10-01 19:00:00', end_time: '2026-10-01 21:00:00',
  status: 'Confirmed', location_text: null, building: 'Everitt Laboratory', room_number: '151',
};

const WRITTEN_AT = '2026-09-05 12:00:00';

function outboxEntry(outbox_id, kind, subject_type, subject_id, rso_id, payload) {
  return { outbox_id, kind, subject_type, subject_id, rso_id, payload, created_at: WRITTEN_AT };
}

function outboxEntries() {
  const event = presentEvent(EVENT_ROW);
  return [
    outboxEntry(1, 'event.created', 'event', '10', 1, { event }),
    outboxEntry(2, 'event.updated', 'event', '10', 1,
      { event, changed: ['start_time', 'end_time'] }),
    outboxEntry(3, 'event.cancelled', 'event', '10', 1,
      { event: { ...event, cancelled_at: WRITTEN_AT } }),
    outboxEntry(4, 'event.deleted', 'event', '10', 1, { event }),
    outboxEntry(5, 'series.created', 'series', '4', 1,
      { series: SERIES, event_ids: [10, 11, 12] }),
    outboxEntry(6, 'series.updated', 'series', '4', 1,
      { series: SERIES, event_ids: [10, 11, 12], affected_event_ids: [11, 12], changed: ['title'] }),
    outboxEntry(7, 'series.deleted', 'series', '4', 1,
      { series: SERIES, event_ids: [], affected_event_ids: [10, 11, 12] }),
    outboxEntry(8, 'midterm.confirmed', 'midterm', '20', null, { midterm: MIDTERM }),
    outboxEntry(9, 'midterm.updated', 'midterm', '20', null, { midterm: MIDTERM }),
    outboxEntry(10, 'midterm.cancelled', 'midterm', '20', null,
      { midterm: { ...MIDTERM, status: 'Cancelled' }, deleted: true }),
    outboxEntry(11, 'membership.changed', 'membership', 'alice:1', 1,
      { net_id: 'alice', rso_id: 1, role: 'Board' }),
  ];
}

const asBot = path => request(app).get(path).set('Authorization', `Bearer ${TOKEN}`);
const acting = path => asBot(path).set('X-Via-Acting-Discord-User', '123456789012345678');
const post = path => request(app).post(path).set('Authorization', `Bearer ${TOKEN}`);
const actingPost = path => post(path).set('X-Via-Acting-Discord-User', '123456789012345678');

// The calendar file carries the moment it was written, so the clock is held
// still while these answers are taken.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-05T17:00:00Z'));
});
afterAll(() => { vi.useRealTimers(); });

beforeEach(() => {
  getLinkByDiscordUserId.mockResolvedValue({ netId: 'alice', isGlobalAdmin: 0 });
  rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Board' }]);
  rsoDb.getMembership.mockResolvedValue({ role: 'Board' });
  reads.listRsos.mockResolvedValue([RSO]);
  reads.getRso.mockResolvedValue(RSO);
  reads.getRsoMembers.mockResolvedValue([{ net_id: 'alice', full_name: 'Alice Adams', role: 'Board' }]);
  reads.listEvents.mockResolvedValue([EVENT_ROW]);
  reads.countEvents.mockResolvedValue(1);
  reads.listMidterms.mockResolvedValue([{
    midterm_id: 20, course_code: 'ECE 385', course_title: 'Digital Systems Laboratory',
    title: 'Midterm 1', start_time: '2026-10-01 19:00:00', end_time: '2026-10-01 21:00:00',
    status: 'Confirmed', location_text: null, building: 'Everitt Laboratory', room_number: '151',
  }]);
  reads.searchCourses.mockResolvedValue([{ course_code: 'ECE 385', title: 'Digital Systems Laboratory' }]);
  reads.listRoomsInBuilding.mockResolvedValue([ROOM]);
  eventsDb.getEventById.mockResolvedValue({ ...EVENT_ROW, detached: 0, tags: 'social' });
  searchLocations.mockResolvedValue([ROOM]);
  getSectionsForCourses.mockResolvedValue([SECTION]);
  occupiedLocationIds.mockResolvedValue(new Set());
  readOutbox.mockResolvedValue(outboxEntries().slice(0, 2));
  linksDb.openLinkSession.mockResolvedValue({
    sessionId: 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT',
    expiresAt: '2026-09-04 18:40:00',
  });
  linksDb.getLinkWithMemberships.mockResolvedValue({
    discord_user_id: '204255221017214977',
    net_id: 'rgarcia7',
    display_name: 'Rosa Garcia',
    is_global_admin: false,
    linked_at: '2026-09-04 18:32:11',
    memberships: [
      { rso_id: 4, rso_name: 'IEEE Student Branch', role: 'Board' },
      { rso_id: 9, rso_name: 'HKN', role: 'Member' },
    ],
  });
});

describe('the answer shapes the Discord bot depends on', () => {
  it('every RSO', async () => {
    const res = await asBot('/internal/v1/rsos');
    expect(res.status).toBe(200);
    fixture('rsos', res.body);
  });

  it('one RSO with its next events', async () => {
    const res = await asBot('/internal/v1/rsos/1');
    expect(res.status).toBe(200);
    fixture('rso', res.body);
  });

  it('the membership of an RSO', async () => {
    const res = await acting('/internal/v1/rsos/1/members');
    expect(res.status).toBe(200);
    fixture('rsoMembers', res.body);
  });

  it('the event list', async () => {
    const res = await asBot('/internal/v1/events');
    expect(res.status).toBe(200);
    fixture('events', res.body);
  });

  it('one event', async () => {
    const res = await asBot('/internal/v1/events/10');
    expect(res.status).toBe(200);
    fixture('event', res.body);
  });

  it('one event as a calendar file', async () => {
    const res = await asBot('/internal/v1/events/10/calendar');
    expect(res.status).toBe(200);
    fixture('eventCalendar', { content_type: res.headers['content-type'], body: res.text });
  });

  it('the midterm schedule', async () => {
    const res = await asBot('/internal/v1/midterms');
    expect(res.status).toBe(200);
    fixture('midterms', res.body);
  });

  it('a course search, with sections', async () => {
    const res = await asBot('/internal/v1/courses?query=ECE&sections=true');
    expect(res.status).toBe(200);
    fixture('courses', res.body);
  });

  it('a room search', async () => {
    const res = await asBot('/internal/v1/locations?query=eceb');
    expect(res.status).toBe(200);
    fixture('locations', res.body);
  });

  it('the rooms free in a building', async () => {
    const res = await asBot('/internal/v1/locations/free?building=ECEB&from=2026-09-10%2018:00:00&to=2026-09-10%2019:00:00');
    expect(res.status).toBe(200);
    fixture('locationsFree', res.body);
  });

  it('one building', async () => {
    const res = await asBot('/internal/v1/buildings/ECEB');
    expect(res.status).toBe(200);
    fixture('building', res.body);
  });

  it('the outbox', async () => {
    const res = await asBot('/internal/v1/outbox?after=0');
    expect(res.status).toBe(200);
    fixture('outbox', res.body);
  });

  it('one outbox entry of every kind', async () => {
    readOutbox.mockResolvedValue(outboxEntries());
    const res = await asBot('/internal/v1/outbox?after=0');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(11);
    fixture('outboxEntries', res.body);
  });

  it('a new link session', async () => {
    const res = await post('/internal/v1/links/sessions').send({ discord_user_id: '204255221017214977' });
    expect(res.status).toBe(201);
    fixture('links.session', res.body);
  });

  it('a resolved link', async () => {
    const res = await asBot('/internal/v1/links/204255221017214977');
    expect(res.status).toBe(200);
    fixture('links.link', res.body);
  });

  it('an account nobody linked', async () => {
    linksDb.getLinkWithMemberships.mockResolvedValue(null);
    const res = await asBot('/internal/v1/links/999999999999999999');
    expect(res.status).toBe(404);
    fixture('links.unlinked', res.body);
  });

  it('a confirmed server binding', async () => {
    reads.getRso.mockResolvedValue({ ...RSO, rso_id: 4, name: 'IEEE Student Branch' });
    const res = await actingPost('/internal/v1/guilds/bindings/confirm').send({ rso_id: 4 });
    expect(res.status).toBe(200);
    fixture('bindingsConfirm', res.body);
  });

  it('a refusal', async () => {
    const res = await asBot('/internal/v1/buildings/ZZZ');
    expect(res.status).toBe(404);
    fixture('refusal', res.body);
  });
});
