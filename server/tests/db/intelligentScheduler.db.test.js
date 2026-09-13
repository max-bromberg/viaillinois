import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let recommend;

// One pool serves both suites in this file, so it is closed once, after both.
afterAll(async () => {
  const pool = (await import('../../db/pool.js')).default;
  await pool.end();
});

/** A weekday well into the future, so nothing here depends on the day it runs. */
const DAY = '2027-09-07';
const NEXT_DAY = '2027-09-08';
const SLOT_START = `${DAY} 18:00:00`;
const SLOT_END = `${DAY} 19:00:00`;

const PARAMS = {
  durationMinutes: 60,
  // The window ends the following day because the feed query reads the end of
  // a range as midnight, so a range that ends on the day itself carries none
  // of that evening's events.
  dateRange: { start: DAY, end: NEXT_DAY },
  timeConstraint: { startHour: 18, endHour: 19, tier: 'strongly_preferred' },
  dayConstraints: [],
  venueConstraints: { buildings: [], specificRoom: null },
  targetCourses: [],
  midtermSensitivity: 'medium',
};

/**
 * The scheduler against the real tables.
 *
 * What it recommends is a room and an hour, and the whole value of the answer
 * is that the room is free then. It reads the events out of the same feed
 * query the website reads, so what that query answers with decides what the
 * scheduler believes is in the way.
 */
describe('the scheduler on a room that has a cancelled event in it', () => {
  let conn;

  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    const { applyMigrations } = await import('../../db/migrate.ts');
    await resetTestDb();
    await applyMigrations();
    ({ recommend } = await import('../../services/intelligentScheduler.js'));
  }, 180_000);

  afterAll(async () => { if (conn) await conn.end(); });

  beforeEach(async () => {
    if (!conn) conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM Course_Sections');
    await conn.query('DELETE FROM Facility_Reservations');
    await conn.query('DELETE FROM Locations');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'T', 't@illinois.edu')");
    await conn.query(
      "INSERT INTO Locations (location_id, building, room_number, max_capacity) "
      + "VALUES (1, 'Electrical & Computer Eng Bldg', '3002', 60)",
    );
  });

  /** The one event, in the one room, in the one hour the search looks at. */
  async function seedEvent({ cancelled }) {
    await conn.query(
      'INSERT INTO Events (rso_id, created_by, location_id, title, start_time, end_time, is_private, cancelled_at) '
      + 'VALUES (1, ?, 1, ?, ?, ?, 0, ?)',
      ['tester', 'General meeting', SLOT_START, SLOT_END, cancelled ? `${DAY} 09:00:00` : null],
    );
  }

  /** Whether the search offered the one room at the one hour. */
  const offersTheRoom = result =>
    result.allOptions.some(option => option.start === SLOT_START && option.location.location_id === 1);

  it('does not offer a room that a live event is in', async () => {
    await seedEvent({ cancelled: false });
    expect(offersTheRoom(await recommend(PARAMS))).toBe(false);
  });

  it('offers the same room at the same hour once that event is called off', async () => {
    // A cancelled event is off the feed and off the room. Leaving it in the
    // way means a board that called a meeting off cannot book the room it
    // gave up, and neither can anybody else.
    await seedEvent({ cancelled: true });
    expect(offersTheRoom(await recommend(PARAMS))).toBe(true);
  });

  it('offers the room when there is no event in it at all, which is the control', async () => {
    expect(offersTheRoom(await recommend(PARAMS))).toBe(true);
  });
});

/**
 * The recorded answer and the service that produces it.
 *
 * The contract fixtures are written from the internal endpoints with the
 * scheduler mocked, because the scheduler needs a term of seeded data to say
 * anything. That leaves the recorded shape free to drift away from the shape
 * the service actually answers with, and the bot reads the recorded one. This
 * runs the real service against real rows and holds the two together by their
 * keys, which is what a shape is. The values are the recording's own business.
 */
describe('the scheduler and the recorded contract fixture', () => {
  const FIXTURE = JSON.parse(readFileSync(
    join(import.meta.dirname, '..', 'fixtures', 'internal', 'acting.recommend.json'), 'utf8'));

  const keysOf = value => Object.keys(value).sort();

  let conn;

  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    const { applyMigrations } = await import('../../db/migrate.ts');
    await resetTestDb();
    await applyMigrations();
    ({ recommend } = await import('../../services/intelligentScheduler.js'));

    conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM Course_Sections');
    await conn.query('DELETE FROM Facility_Reservations');
    await conn.query('DELETE FROM Locations');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'T', 't@illinois.edu')");
    await conn.query(
      "INSERT INTO Locations (location_id, building, room_number, max_capacity) VALUES "
      + "(5, 'Electrical & Computer Eng Bldg', '1002', 40), "
      + "(6, 'Campus Instructional Facility', '3025', 60)",
    );
    // One week taken in one of the two rooms, so a candidate carries a
    // conflict as well as the weeks it is clear for.
    await conn.query(
      'INSERT INTO Events (rso_id, created_by, location_id, title, start_time, end_time, is_private) '
      + "VALUES (1, 'tester', 5, 'Somebody else', '2027-09-15 18:00:00', '2027-09-15 19:00:00', 0)",
    );
  }, 180_000);

  afterAll(async () => { if (conn) await conn.end(); });

  /** A repeat, because that is the request the recorded fixture was made from. */
  const answer = () => recommend({
    durationMinutes: 60,
    dateRange: { start: '2027-09-07', end: '2027-09-21' },
    timeConstraint: { startHour: 18, endHour: 20, tier: 'strongly_preferred' },
    dayConstraints: [{ day: 'Wed', tier: 'required' }],
    venueConstraints: { buildings: [], specificRoom: null },
    excludedRooms: [],
    targetCourses: [],
    midtermSensitivity: 'medium',
    recurrence: { intervalWeeks: 1, daysOfWeek: ['Wed'], until: '2027-10-27' },
  });

  it('answers with the keys the recorded fixture holds', async () => {
    expect(keysOf(await answer())).toEqual(keysOf(FIXTURE));
  });

  it('gives every candidate the keys a recorded candidate holds', async () => {
    const result = await answer();
    const recorded = FIXTURE.allOptions[0];
    const candidates = [...result.curatedPicks, ...result.allOptions];
    expect(candidates.length).toBeGreaterThan(0);

    for (const candidate of candidates) {
      expect(keysOf(candidate)).toEqual(keysOf(recorded));
      expect(keysOf(candidate.location)).toEqual(keysOf(recorded.location));
      expect(keysOf(candidate.recurrence)).toEqual(keysOf(recorded.recurrence));
      for (const insight of candidate.insights) {
        expect(keysOf(insight)).toEqual(keysOf(recorded.insights[0]));
      }
    }
  });
});
