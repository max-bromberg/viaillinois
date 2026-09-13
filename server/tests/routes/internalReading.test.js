import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const recordDenial = vi.hoisted(() => vi.fn());
vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial,
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
  getEventById: vi.fn(), getPublicEvents: vi.fn().mockResolvedValue([]),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getAllEvents: vi.fn().mockResolvedValue([]), countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  getVisibleEvents: vi.fn().mockResolvedValue([]), countVisibleEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
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
  searchLocations, getOccupiedDuring: vi.fn().mockResolvedValue([]),
  upsertLocation: vi.fn(), getByCapacity: vi.fn(), allLocations: vi.fn(), getById: vi.fn(),
  clearLocationCache: vi.fn(),
}));

const getSectionsForCourses = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/courses.js', () => ({
  getSectionsForCourses, getCourses: vi.fn(), getCourseCodes: vi.fn(),
  getSectionsByCourse: vi.fn(), upsertCourse: vi.fn(), upsertSection: vi.fn(),
}));

const occupiedLocationIds = vi.hoisted(() => vi.fn());
vi.mock('../../services/conflictDetector.js', () => ({
  occupiedLocationIds, checkConflict: vi.fn().mockResolvedValue(false),
}));

const TOKEN = 'd'.repeat(64);
process.env.BOT_SERVICE_TOKEN = TOKEN;

const app = (await import('../../app.js')).default;

const asBot = path => request(app).get(path).set('Authorization', `Bearer ${TOKEN}`);
const ACTING = '123456789012345678';
const acting = path => asBot(path).set('X-Via-Acting-Discord-User', ACTING);

const RSO = { rso_id: 1, name: 'IEEE', description: 'The student branch.', logo_color: '#13294B' };

const EVENT = {
  event_id: 10, rso_id: 1, rso_name: 'IEEE', title: 'General meeting',
  description: 'Bring a laptop.', start_time: '2026-09-10 18:00:00', end_time: '2026-09-10 19:00:00',
  is_private: 0, cancelled_at: null, location_id: 5, building: 'Electrical & Computer Eng Bldg',
  room_number: '1002', location_text: null, location_note: 'Use the north entrance.',
  series_id: null, series_frequency: null, series_interval_weeks: null,
  series_days_of_week: null, series_ends_on: null, interest_count: 3,
};

const PRIVATE_EVENT = { ...EVENT, event_id: 11, is_private: 1, title: 'Board planning' };

beforeEach(() => {
  for (const fn of Object.values(reads)) fn.mockReset();
  recordDenial.mockClear();
  getLinkByDiscordUserId.mockReset().mockResolvedValue({ netId: 'alice', isGlobalAdmin: 0 });
  rsoDb.getUserMemberships.mockReset().mockResolvedValue([]);
  rsoDb.getMembership.mockReset().mockResolvedValue(null);
  eventsDb.getEventById.mockReset().mockResolvedValue({ ...EVENT });
  searchLocations.mockReset().mockResolvedValue([]);
  getSectionsForCourses.mockReset().mockResolvedValue([]);
  occupiedLocationIds.mockReset().mockResolvedValue(new Set());
  reads.listRsos.mockResolvedValue([RSO]);
  reads.getRso.mockResolvedValue(RSO);
  reads.getRsoMembers.mockResolvedValue([{ net_id: 'alice', full_name: 'Alice', role: 'Board' }]);
  reads.listEvents.mockResolvedValue([EVENT]);
  reads.countEvents.mockResolvedValue(1);
  reads.listMidterms.mockResolvedValue([]);
  reads.searchCourses.mockResolvedValue([]);
  reads.listRoomsInBuilding.mockResolvedValue([]);
  reads.getSectionsOccupying.mockResolvedValue([]);
});

describe('GET /internal/v1/rsos', () => {
  it('answers every RSO, for autocomplete and community server setup', async () => {
    const res = await asBot('/internal/v1/rsos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rsos: [RSO] });
  });
});

describe('GET /internal/v1/rsos/:id', () => {
  it('answers the RSO with its next events', async () => {
    const res = await asBot('/internal/v1/rsos/1');
    expect(res.status).toBe(200);
    expect(res.body.rso).toEqual(RSO);
    expect(res.body.events).toHaveLength(1);
    expect(reads.listEvents).toHaveBeenCalledWith(expect.objectContaining({
      rsoIds: [1], timeframe: 'upcoming', privateRsoIds: [],
    }));
  });

  it('leaves internal events out for a caller acting as nobody', async () => {
    await asBot('/internal/v1/rsos/1');
    expect(reads.listEvents.mock.calls[0][0].privateRsoIds).toEqual([]);
  });

  it('includes internal events when the acting person is a member', async () => {
    rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Member' }]);
    await acting('/internal/v1/rsos/1');
    expect(reads.listEvents.mock.calls[0][0].privateRsoIds).toEqual([1]);
  });

  it('answers 404 with a code for an RSO that does not exist', async () => {
    reads.getRso.mockResolvedValue(null);
    const res = await asBot('/internal/v1/rsos/99');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: expect.any(String), code: 'not_found' });
  });

  it('refuses an identifier that is not a whole number', async () => {
    const res = await asBot('/internal/v1/rsos/abc');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });
});

describe('GET /internal/v1/rsos/:id/members', () => {
  it('answers the membership to a board member of that RSO', async () => {
    rsoDb.getMembership.mockResolvedValue({ role: 'Board' });
    const res = await acting('/internal/v1/rsos/1/members');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ members: [{ net_id: 'alice', full_name: 'Alice', role: 'Board' }] });
  });

  it('refuses a linked person who is only a member, with a code', async () => {
    rsoDb.getMembership.mockResolvedValue({ role: 'Member' });
    const res = await acting('/internal/v1/rsos/1/members');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: expect.any(String), code: 'forbidden' });
  });

  it('refuses a request that acts as nobody', async () => {
    const res = await asBot('/internal/v1/rsos/1/members');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('refuses a Discord account with no link', async () => {
    getLinkByDiscordUserId.mockResolvedValue(null);
    const res = await acting('/internal/v1/rsos/1/members');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_linked');
  });
});

describe('GET /internal/v1/events', () => {
  it('answers the events and the total', async () => {
    const res = await asBot('/internal/v1/events');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.events[0]).toMatchObject({ event_id: 10, rso_name: 'IEEE', interest_count: 3 });
  });

  it('reads the feed filters from the query string', async () => {
    await asBot('/internal/v1/events?rso_ids=1,2&from=2026-09-01&to=2026-09-30&timeframe=archived&limit=5&offset=10');
    expect(reads.listEvents).toHaveBeenCalledWith(expect.objectContaining({
      rsoIds: [1, 2], from: '2026-09-01 00:00:00', to: '2026-09-30 23:59:59',
      timeframe: 'archived', limit: 5, offset: 10,
    }));
  });

  it('asks for what is coming up when no timeframe is named', async () => {
    await asBot('/internal/v1/events');
    expect(reads.listEvents.mock.calls[0][0].timeframe).toBe('upcoming');
  });

  it('refuses a timeframe it does not have', async () => {
    const res = await asBot('/internal/v1/events?timeframe=someday');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(reads.listEvents).not.toHaveBeenCalled();
  });

  it('refuses an RSO filter that is not a list of whole numbers', async () => {
    const res = await asBot('/internal/v1/events?rso_ids=1,two');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  it('refuses a date that is not a campus wall clock date', async () => {
    const res = await asBot('/internal/v1/events?from=last%20tuesday');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  it('clamps a limit above the ceiling the public feed uses', async () => {
    await asBot('/internal/v1/events?limit=9000');
    expect(reads.listEvents.mock.calls[0][0].limit).toBe(500);
  });

  it('refuses paging deeper than the feed allows', async () => {
    const res = await asBot('/internal/v1/events?offset=500000');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String), code: 'invalid' });
    expect(reads.listEvents).not.toHaveBeenCalled();
  });

  describe('internal events', () => {
    it('are left out for a request that acts as nobody', async () => {
      await asBot('/internal/v1/events?include_internal=true');
      expect(reads.listEvents.mock.calls[0][0].privateRsoIds).toEqual([]);
    });

    it('are left out when the acting person is not a member of that RSO', async () => {
      rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 7, role: 'Member' }]);
      await acting('/internal/v1/events?include_internal=true');
      expect(reads.listEvents.mock.calls[0][0].privateRsoIds).toEqual([7]);
    });

    it('are included for the RSOs the acting person belongs to', async () => {
      rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Member' }, { rso_id: 7, role: 'Board' }]);
      await acting('/internal/v1/events?include_internal=true');
      expect(reads.listEvents.mock.calls[0][0].privateRsoIds).toEqual([1, 7]);
    });

    it('are all included for a global administrator', async () => {
      getLinkByDiscordUserId.mockResolvedValue({ netId: 'root', isGlobalAdmin: 1 });
      await acting('/internal/v1/events?include_internal=true');
      expect(reads.listEvents.mock.calls[0][0].privateRsoIds).toBeNull();
    });

    it('are left out when the request does not ask for them', async () => {
      rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Member' }]);
      await acting('/internal/v1/events');
      expect(reads.listEvents.mock.calls[0][0].privateRsoIds).toEqual([]);
    });
  });
});

describe('GET /internal/v1/events/:id', () => {
  it('answers one event with its interest count', async () => {
    const res = await asBot('/internal/v1/events/10');
    expect(res.status).toBe(200);
    expect(res.body.event).toMatchObject({ event_id: 10, interest_count: 3, location_note: 'Use the north entrance.' });
  });

  it('carries the series when the event belongs to one', async () => {
    eventsDb.getEventById.mockResolvedValue({
      ...EVENT, series_id: 4, series_frequency: 'weekly', series_interval_weeks: 1,
      series_days_of_week: 'MO,WE', series_ends_on: '2026-12-10',
    });
    const res = await asBot('/internal/v1/events/10');
    expect(res.body.event).toMatchObject({ series_id: 4, series_frequency: 'weekly', series_days_of_week: 'MO,WE' });
  });

  it('answers 404 for an event that does not exist', async () => {
    eventsDb.getEventById.mockResolvedValue(null);
    const res = await asBot('/internal/v1/events/99');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('hides an internal event from a request that acts as nobody', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...PRIVATE_EVENT });
    const res = await asBot('/internal/v1/events/11');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('hides an internal event from a person who is not a member of that RSO', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...PRIVATE_EVENT });
    rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 7, role: 'Member' }]);
    const res = await acting('/internal/v1/events/11');
    expect(res.status).toBe(404);
  });

  it('shows an internal event to a member of that RSO', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...PRIVATE_EVENT });
    rsoDb.getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Member' }]);
    const res = await acting('/internal/v1/events/11');
    expect(res.status).toBe(200);
    expect(res.body.event.event_id).toBe(11);
  });

  it('shows an internal event to a global administrator', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...PRIVATE_EVENT });
    getLinkByDiscordUserId.mockResolvedValue({ netId: 'root', isGlobalAdmin: 1 });
    expect((await acting('/internal/v1/events/11')).status).toBe(200);
  });
});

describe('GET /internal/v1/events/:id/calendar', () => {
  /**
   * The bot hands this file to a person, and a browser that is shown a
   * calendar file with no name for it either renders it as text or saves it
   * under the name of the endpoint. Naming it is what makes it arrive as a
   * file somebody can open.
   */
  it('offers the file under a name of its own', async () => {
    const res = await asBot('/internal/v1/events/10/calendar');
    expect(res.headers['content-disposition'])
      .toBe('attachment; filename="via-event-10.ics"');
  });

  it('answers the event as a calendar file', async () => {
    const res = await asBot('/internal/v1/events/10/calendar');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain('UID:via-event-10@viaillinois.com');
    expect(res.text).toContain('SUMMARY:General meeting');
  });

  it('answers 404 in the error shape for an event that does not exist', async () => {
    eventsDb.getEventById.mockResolvedValue(null);
    const res = await asBot('/internal/v1/events/99/calendar');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('not_found');
  });

  it('hides an internal event, exactly as the event itself does', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...PRIVATE_EVENT });
    expect((await asBot('/internal/v1/events/11/calendar')).status).toBe(404);
  });
});

describe('GET /internal/v1/midterms', () => {
  it('answers the exams that are confirmed or waiting to be confirmed', async () => {
    reads.listMidterms.mockResolvedValue([{
      midterm_id: 3, course_code: 'ECE 385', course_title: 'Digital Systems Laboratory',
      title: 'Midterm 1', start_time: '2026-10-01 19:00:00', end_time: '2026-10-01 21:00:00',
      status: 'Confirmed', building: 'Everitt Laboratory', room_number: '151', location_text: null,
    }]);
    const res = await asBot('/internal/v1/midterms');
    expect(res.status).toBe(200);
    expect(res.body.midterms[0]).toMatchObject({ midterm_id: 3, status: 'Confirmed' });
  });

  it('filters by course', async () => {
    await asBot('/internal/v1/midterms?course=ECE%20385');
    expect(reads.listMidterms).toHaveBeenCalledWith(expect.objectContaining({ courseCode: 'ECE 385' }));
  });

  it('filters by a window of campus dates', async () => {
    await asBot('/internal/v1/midterms?from=2026-10-01&to=2026-10-31');
    expect(reads.listMidterms).toHaveBeenCalledWith(expect.objectContaining({
      from: '2026-10-01 00:00:00', to: '2026-10-31 23:59:59',
    }));
  });

  it('refuses a window that is not made of campus dates', async () => {
    const res = await asBot('/internal/v1/midterms?to=soon');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  it('refuses paging past the ceiling', async () => {
    const res = await asBot('/internal/v1/midterms?offset=500000');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });
});

describe('GET /internal/v1/courses', () => {
  it('searches courses for autocomplete', async () => {
    reads.searchCourses.mockResolvedValue([{ course_code: 'ECE 385', title: 'Digital Systems Laboratory' }]);
    const res = await asBot('/internal/v1/courses?query=385');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ courses: [{ course_code: 'ECE 385', title: 'Digital Systems Laboratory' }] });
    expect(reads.searchCourses).toHaveBeenCalledWith('385', expect.any(Number));
  });

  it('answers nothing for an empty search rather than the whole catalogue', async () => {
    const res = await asBot('/internal/v1/courses?query=');
    expect(res.body).toEqual({ courses: [] });
    expect(reads.searchCourses).not.toHaveBeenCalled();
  });

  it('adds the sections with their meeting times and rooms when asked', async () => {
    reads.searchCourses.mockResolvedValue([{ course_code: 'ECE 385', title: 'Digital Systems Laboratory' }]);
    getSectionsForCourses.mockResolvedValue([{
      section_id: 1, course_code: 'ECE 385', day_of_week: 'MW', start_time: '10:00:00',
      end_time: '11:20:00', semester: 'fall', section_type: 'lecture',
      building: 'Electrical & Computer Eng Bldg', room_number: '1002',
    }]);
    const res = await asBot('/internal/v1/courses?query=385&sections=true');
    expect(getSectionsForCourses).toHaveBeenCalledWith(['ECE 385']);
    expect(res.body.courses[0].sections).toEqual([{
      section_id: 1, day_of_week: 'MW', start_time: '10:00:00', end_time: '11:20:00',
      semester: 'fall', section_type: 'lecture',
      building: 'Electrical & Computer Eng Bldg', room_number: '1002',
    }]);
  });
});

describe('GET /internal/v1/locations', () => {
  it('searches rooms for autocomplete', async () => {
    searchLocations.mockResolvedValue([{ location_id: 5, building: 'Electrical & Computer Eng Bldg', room_number: '1002', max_capacity: 40, has_av_equipment: 1 }]);
    const res = await asBot('/internal/v1/locations?query=eceb');
    expect(res.status).toBe(200);
    expect(res.body.locations).toHaveLength(1);
    expect(searchLocations).toHaveBeenCalledWith('eceb', 10);
  });

  it('answers nothing for an empty search', async () => {
    const res = await asBot('/internal/v1/locations?query=');
    expect(res.body).toEqual({ locations: [] });
    expect(searchLocations).not.toHaveBeenCalled();
  });
});

describe('GET /internal/v1/locations/free', () => {
  const ROOMS = [
    { location_id: 5, building: 'Electrical & Computer Eng Bldg', room_number: '1002', max_capacity: 40, has_av_equipment: 1 },
    { location_id: 6, building: 'Electrical & Computer Eng Bldg', room_number: '3017', max_capacity: 30, has_av_equipment: 0 },
  ];

  it('answers the rooms nothing else has taken', async () => {
    reads.listRoomsInBuilding.mockResolvedValue(ROOMS);
    occupiedLocationIds.mockResolvedValue(new Set([6]));
    const res = await asBot('/internal/v1/locations/free?building=ECEB&from=2026-09-10%2018:00:00&to=2026-09-10%2019:00:00');
    expect(res.status).toBe(200);
    expect(res.body.locations.map(l => l.location_id)).toEqual([5]);
    expect(reads.listRoomsInBuilding).toHaveBeenCalledWith('Electrical & Computer Eng Bldg');
    expect(occupiedLocationIds).toHaveBeenCalledWith('2026-09-10 18:00:00', '2026-09-10 19:00:00');
  });

  it('names the building it understood, so a code is echoed as a name', async () => {
    reads.listRoomsInBuilding.mockResolvedValue(ROOMS);
    const res = await asBot('/internal/v1/locations/free?building=ECEB&from=2026-09-10%2018:00:00&to=2026-09-10%2019:00:00');
    expect(res.body.building).toBe('Electrical & Computer Eng Bldg');
  });

  it('refuses a request with no building', async () => {
    const res = await asBot('/internal/v1/locations/free?from=2026-09-10%2018:00:00&to=2026-09-10%2019:00:00');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });

  it('refuses a window that is missing or backwards', async () => {
    expect((await asBot('/internal/v1/locations/free?building=ECEB')).status).toBe(400);
    const res = await asBot('/internal/v1/locations/free?building=ECEB&from=2026-09-10%2019:00:00&to=2026-09-10%2018:00:00');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
  });
});

describe('GET /internal/v1/buildings/:code', () => {
  it('answers the name behind a code, and no address until one is recorded from the university listing', async () => {
    const res = await asBot('/internal/v1/buildings/eceb');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ building: { code: 'ECEB', name: 'Electrical & Computer Eng Bldg', address: null } });
  });

  it('reads a code however it was typed', async () => {
    expect((await asBot('/internal/v1/buildings/eceb')).body.building.code).toBe('ECEB');
  });

  it('answers 404 with a code for a building it does not know', async () => {
    const res = await asBot('/internal/v1/buildings/ZZZ');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: expect.any(String), code: 'not_found' });
  });
});

/**
 * Every wall clock time the internal API publishes is an instant on the campus
 * clock, exactly as the public API publishes it, because the middleware that
 * does that is mounted for the whole application.
 */
describe('the times in every answer', () => {
  const OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[56]:00$/;

  it('carry the campus offset on the event list', async () => {
    const res = await asBot('/internal/v1/events');
    expect(res.body.events[0].start_time).toMatch(OFFSET);
    expect(res.body.events[0].end_time).toMatch(OFFSET);
  });

  it('carry the campus offset on one event, cancellation included', async () => {
    eventsDb.getEventById.mockResolvedValue({ ...EVENT, cancelled_at: '2026-09-05 09:00:00' });
    const res = await asBot('/internal/v1/events/10');
    expect(res.body.event.start_time).toMatch(OFFSET);
    expect(res.body.event.cancelled_at).toMatch(OFFSET);
  });

  it('carry the campus offset on an RSO page and on the midterms', async () => {
    reads.listMidterms.mockResolvedValue([{
      midterm_id: 3, course_code: 'ECE 385', course_title: 'Digital Systems Laboratory',
      title: 'Midterm 1', start_time: '2026-10-01 19:00:00', end_time: '2026-10-01 21:00:00',
      status: 'Confirmed', building: null, room_number: null, location_text: null,
    }]);
    expect((await asBot('/internal/v1/rsos/1')).body.events[0].start_time).toMatch(OFFSET);
    expect((await asBot('/internal/v1/midterms')).body.midterms[0].start_time).toMatch(OFFSET);
  });

  it('leave a course section meeting time alone, because it names no day', async () => {
    reads.searchCourses.mockResolvedValue([{ course_code: 'ECE 385', title: 'Digital Systems Laboratory' }]);
    getSectionsForCourses.mockResolvedValue([{
      section_id: 1, course_code: 'ECE 385', day_of_week: 'MW', start_time: '10:00:00',
      end_time: '11:20:00', semester: 'fall', section_type: 'lecture',
      building: 'Electrical & Computer Eng Bldg', room_number: '1002',
    }]);
    const res = await asBot('/internal/v1/courses?query=385&sections=true');
    expect(res.body.courses[0].sections[0].start_time).toBe('10:00:00');
  });
});
