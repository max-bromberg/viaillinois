import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';
import { campusStartOfToday } from '../../lib/timezone.js';

let query, end, reads;

beforeAll(async () => {
  ({ query, end } = await migratedDb());
  reads = await import('../../db/queries/internalReads.ts');
}, 180_000);
afterAll(async () => { await end(); });

const TODAY = campusStartOfToday().slice(0, 10);
function campusDay(offset) {
  const [year, month, day] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}
const NEXT_WEEK = campusDay(7);
const LATER = campusDay(9);
const LAST_WEEK = campusDay(-7);

/** A Monday, so that the timetable's day letters can be asserted on a real date. */
const MONDAY = '2026-09-14';
const TUESDAY = '2026-09-15';

async function clear() {
  for (const table of [
    'Event_Interest', 'Events', 'Event_Series', 'Midterms', 'Course_Sections', 'Courses',
    'Facility_Reservations', 'Locations', 'RSO_Memberships', 'RSOs', 'Users',
  ]) {
    await query(`DELETE FROM ${table}`);
  }
}

/**
 * The queries behind the internal service API's reading endpoints, against a
 * database with every migration applied. What is checked here is what only a
 * real database can answer: that the joins reach the right rows, that the
 * feed's archive rule is the same rule the website applies, and that an
 * internal event is invisible unless the caller belongs to that RSO.
 */
describe('the reading queries', () => {
  beforeEach(async () => {
    await clear();
    await query(`INSERT INTO Users (net_id, full_name, email, is_global_admin) VALUES
      ('alice', 'Alice Adams', 'alice@illinois.edu', 0),
      ('bob',   'Bob Brown',   'bob@illinois.edu',   0)`);
    await query(`INSERT INTO RSOs (rso_id, name, description, logo_color) VALUES
      (1, 'IEEE', 'The student branch.', '#13294B'),
      (2, 'ACM',  'The computing club.', '#FF5F05')`);
    await query(`INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES
      ('alice', 1, 'Board'), ('bob', 1, 'Member')`);
    await query(`INSERT INTO Locations (location_id, building, room_number, max_capacity, has_av_equipment) VALUES
      (5, 'Electrical & Computer Eng Bldg', '1002', 40, 1),
      (6, 'Electrical & Computer Eng Bldg', '3017', 30, 0),
      (7, 'Everitt Laboratory', '151', 60, 1)`);
    await query(`INSERT INTO Event_Series (series_id, rso_id, created_by, frequency, interval_weeks, days_of_week, starts_on, ends_on, start_of_day, duration_minutes)
      VALUES (4, 1, 'alice', 'weekly', 1, 'MO,WE', '${TODAY}', '${LATER}', '18:00:00', 60)`);
    await query(`INSERT INTO Events (event_id, rso_id, created_by, location_id, title, description, start_time, end_time, is_private, cancelled_at, location_note, series_id) VALUES
      (10, 1, 'alice', 5, 'General meeting', 'Bring a laptop.', '${NEXT_WEEK} 18:00:00', '${NEXT_WEEK} 19:00:00', 0, NULL, 'Use the north entrance.', 4),
      (11, 1, 'alice', 6, 'Board planning',  NULL,              '${LATER} 18:00:00',     '${LATER} 19:00:00',     1, NULL, NULL, NULL),
      (12, 1, 'alice', 5, 'Called off',      NULL,              '${LATER} 20:00:00',     '${LATER} 21:00:00',     0, '${TODAY} 09:00:00', NULL, NULL),
      (13, 2, 'alice', 7, 'Already happened', NULL,             '${LAST_WEEK} 18:00:00', '${LAST_WEEK} 19:00:00', 0, NULL, NULL, NULL)`);
    await query(`INSERT INTO Event_Interest (event_id, subject, source) VALUES
      (10, 'alice', 'web'), (10, 'h:abc', 'discord_button')`);
    await query(`INSERT INTO Courses (course_code, title) VALUES
      ('ECE 385', 'Digital Systems Laboratory'), ('ECE 391', 'Computer Systems Engineering')`);
    await query(`INSERT INTO Course_Sections (section_id, course_code, location_id, day_of_week, start_time, end_time, semester, section_type) VALUES
      (1, 'ECE 385', 6, 'MW', '10:00:00', '11:20:00', 'fall', 'lecture'),
      (2, 'ECE 391', 7, 'TR', '14:00:00', '15:20:00', 'fall', 'lecture')`);
    await query(`INSERT INTO Midterms (midterm_id, course_code, submitted_by, location_id, title, start_time, end_time, status) VALUES
      (20, 'ECE 385', 'alice', 7, 'Midterm 1', '${NEXT_WEEK} 19:00:00', '${NEXT_WEEK} 21:00:00', 'Confirmed'),
      (21, 'ECE 391', 'alice', NULL, 'Midterm 1', '${LATER} 19:00:00', '${LATER} 21:00:00', 'Pending'),
      (22, 'ECE 391', 'alice', NULL, 'Called off', '${LATER} 09:00:00', '${LATER} 10:00:00', 'Cancelled')`);
  });

  it('lists every RSO by name, with the fields a Discord server needs', async () => {
    expect(await reads.listRsos()).toEqual([
      { rso_id: 2, name: 'ACM', description: 'The computing club.', logo_color: '#FF5F05' },
      { rso_id: 1, name: 'IEEE', description: 'The student branch.', logo_color: '#13294B' },
    ]);
  });

  it('answers one RSO, and nothing for an identifier nobody has', async () => {
    expect(await reads.getRso(1)).toMatchObject({ rso_id: 1, name: 'IEEE' });
    expect(await reads.getRso(99)).toBeNull();
  });

  it('answers the membership with the name and the role', async () => {
    expect(await reads.getRsoMembers(1)).toEqual([
      { net_id: 'alice', full_name: 'Alice Adams', role: 'Board' },
      { net_id: 'bob', full_name: 'Bob Brown', role: 'Member' },
    ]);
    expect(await reads.getRsoMembers(2)).toEqual([]);
  });

  it('carries the RSO, the room, the note, the series and the interest count', async () => {
    const [event] = await reads.listEvents({ rsoIds: [1], timeframe: 'upcoming' });
    expect(event).toMatchObject({
      event_id: 10, rso_id: 1, rso_name: 'IEEE', title: 'General meeting',
      location_id: 5, building: 'Electrical & Computer Eng Bldg', room_number: '1002',
      location_note: 'Use the north entrance.', series_id: 4, series_frequency: 'weekly',
      series_days_of_week: 'MO,WE', interest_count: 2,
    });
    expect(event.series_ends_on).toBe(LATER);
  });

  it('leaves a cancelled event and a past one out of what is coming up', async () => {
    const titles = (await reads.listEvents({ timeframe: 'upcoming' })).map(e => e.title);
    expect(titles).toEqual(['General meeting']);
    expect(await reads.countEvents({ timeframe: 'upcoming' })).toBe(1);
  });

  it('puts the cancelled event and the past one in the archive, newest first', async () => {
    const titles = (await reads.listEvents({ timeframe: 'archived' })).map(e => e.title);
    expect(titles).toEqual(['Called off', 'Already happened']);
    expect(await reads.countEvents({ timeframe: 'archived' })).toBe(2);
  });

  it('answers every event, private ones included, when the caller may see them', async () => {
    const all = await reads.listEvents({ timeframe: 'all', privateRsoIds: null });
    expect(all).toHaveLength(4);
    expect(await reads.countEvents({ timeframe: 'all', privateRsoIds: null })).toBe(4);
  });

  it('hides an internal event from a caller acting as nobody', async () => {
    const titles = (await reads.listEvents({ timeframe: 'all', privateRsoIds: [] })).map(e => e.title);
    expect(titles).not.toContain('Board planning');
  });

  it('shows an internal event only to the RSOs the caller belongs to', async () => {
    const mine = (await reads.listEvents({ timeframe: 'all', privateRsoIds: [1] })).map(e => e.title);
    expect(mine).toContain('Board planning');
    const others = (await reads.listEvents({ timeframe: 'all', privateRsoIds: [2] })).map(e => e.title);
    expect(others).not.toContain('Board planning');
  });

  it('narrows to the RSOs and the window a request named', async () => {
    expect((await reads.listEvents({ rsoIds: [2], timeframe: 'all' })).map(e => e.title))
      .toEqual(['Already happened']);
    const window = await reads.listEvents({
      timeframe: 'all', from: `${LATER} 00:00:00`, to: `${LATER} 23:59:59`, privateRsoIds: [1],
    });
    expect(window.map(e => e.title).sort()).toEqual(['Board planning', 'Called off']);
  });

  it('pages the way the feed pages', async () => {
    const page = await reads.listEvents({ timeframe: 'all', limit: 1, offset: 1 });
    expect(page).toHaveLength(1);
    expect(page[0].title).not.toBe('Already happened');
  });

  it('answers the exams that are confirmed or waiting, never a cancelled one', async () => {
    const rows = await reads.listMidterms();
    expect(rows.map(m => m.midterm_id)).toEqual([20, 21]);
    expect(rows[0]).toMatchObject({
      course_code: 'ECE 385', course_title: 'Digital Systems Laboratory',
      status: 'Confirmed', building: 'Everitt Laboratory', room_number: '151',
    });
    expect(rows[1].building).toBeNull();
  });

  it('filters exams by course and by window', async () => {
    expect((await reads.listMidterms({ courseCode: 'ECE 391' })).map(m => m.midterm_id)).toEqual([21]);
    expect((await reads.listMidterms({ from: `${LATER} 00:00:00` })).map(m => m.midterm_id)).toEqual([21]);
    expect((await reads.listMidterms({ to: `${NEXT_WEEK} 23:59:59` })).map(m => m.midterm_id)).toEqual([20]);
  });

  it('searches courses by code and by title', async () => {
    expect((await reads.searchCourses('385')).map(c => c.course_code)).toEqual(['ECE 385']);
    expect((await reads.searchCourses('Systems')).map(c => c.course_code)).toEqual(['ECE 385', 'ECE 391']);
    expect(await reads.searchCourses('%')).toEqual([]);
  });

  it('lists the rooms in one building', async () => {
    expect((await reads.listRoomsInBuilding('Electrical & Computer Eng Bldg')).map(l => l.location_id))
      .toEqual([5, 6]);
    expect(await reads.listRoomsInBuilding('Nowhere Hall')).toEqual([]);
  });

  it('knows which rooms a class is meeting in during a window', async () => {
    expect(await reads.getSectionsOccupying(`${MONDAY} 10:30:00`, `${MONDAY} 11:00:00`)).toEqual([6]);
    expect(await reads.getSectionsOccupying(`${MONDAY} 12:00:00`, `${MONDAY} 13:00:00`)).toEqual([]);
    expect((await reads.getSectionsOccupying(`${TUESDAY} 14:30:00`, `${TUESDAY} 15:00:00`))).toEqual([7]);
  });

  it('reads a window that spans several days one day at a time', async () => {
    const occupied = await reads.getSectionsOccupying(`${MONDAY} 12:00:00`, `${TUESDAY} 15:00:00`);
    expect(occupied.sort()).toEqual([7]);
    const both = await reads.getSectionsOccupying(`${MONDAY} 10:30:00`, `${TUESDAY} 15:00:00`);
    expect(both.sort()).toEqual([6, 7]);
  });
});
