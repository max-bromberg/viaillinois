import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));
const getLinkByDiscordUserId = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/discordLinks.ts', () => ({ getLinkByDiscordUserId }));
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

const TOKEN = 'e'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;

const app = (await import('../../app.js')).default;

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

const asBot = path => request(app).get(path).set('Authorization', `Bearer ${TOKEN}`);
const acting = path => asBot(path).set('X-Via-Acting-Discord-User', '123456789012345678');

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

  it('a refusal', async () => {
    const res = await asBot('/internal/v1/buildings/ZZZ');
    expect(res.status).toBe(404);
    fixture('refusal', res.body);
  });
});
