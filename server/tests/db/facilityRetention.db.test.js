import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let reservations;

/**
 * Keeping what the facilities pollers collect.
 *
 * Until migration 0021 a reservation was deleted within hours of the event happening, so
 * VIA never retained a single completed booking. Expired rows still leave the working set,
 * because every reader on a request path only asks about the present and the future and
 * that table has to stay small. They move into history now rather than going.
 *
 * History normalises its text, because it grows without bound and its text repeats
 * enormously: a course section meeting three times a week writes the same name and the
 * same instructor dozens of times.
 */
describe('keeping reservations after they have happened', () => {
  afterAll(async () => {
    const pool = (await import('../../db/pool.js')).default;
    await pool.end();
  });

  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    await resetTestDb();
    const { applyMigrations } = await import('../../db/migrate.ts');
    await applyMigrations();
    reservations = await import('../../db/queries/facilityReservations.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Facility_Reservation_History');
    await conn.query('DELETE FROM Facility_Reservations');
    await conn.query('DELETE FROM Facility_Text');
    await conn.query('DELETE FROM Locations');
    await conn.query(
      `INSERT INTO Locations (location_id, building, room_number, max_capacity)
       VALUES (1, 'ECEB', '1002', 100), (2, 'ECEB', '3017', 40)`);
    await conn.end();
  });

  /** A booking that finished an hour ago, and one that has not happened yet. */
  const PAST = { start: '2020-03-01 09:00:00', end: '2020-03-01 10:00:00' };
  const FUTURE = { start: '2099-03-01 09:00:00', end: '2099-03-01 10:00:00' };

  const booking = (overrides = {}) => ({
    location_id: 1,
    customer: 'IEEE',
    event_name: 'Soldering night',
    start_time: PAST.start,
    end_time: PAST.end,
    source: 'astra',
    activity_id: 'A-1001',
    parent_activity_id: 'P-77',
    activity_type: 'EVENT',
    section_id: null,
    instructor: null,
    ...overrides,
  });

  it('moves a booking that has happened out of the working set', async () => {
    await reservations.upsertReservation(booking());
    await reservations.archiveExpiredReservations();

    expect(await reservations.findReservation(1, PAST.start, PAST.end)).toBe(null);
  });

  it('keeps it, which is the whole point, rather than deleting it', async () => {
    await reservations.upsertReservation(booking());
    await reservations.archiveExpiredReservations();

    const kept = await reservations.getHistoryOverlapping('2020-01-01 00:00:00', '2020-12-31 00:00:00');
    expect(kept).toHaveLength(1);
    expect(kept[0].event_name).toBe('Soldering night');
    expect(kept[0].customer).toBe('IEEE');
  });

  it('leaves a booking that has not happened yet where it is', async () => {
    await reservations.upsertReservation(booking({ start_time: FUTURE.start, end_time: FUTURE.end }));
    await reservations.archiveExpiredReservations();

    expect(await reservations.findReservation(1, FUTURE.start, FUTURE.end)).toBeTruthy();
    expect(await reservations.getHistoryOverlapping(FUTURE.start, FUTURE.end)).toHaveLength(0);
  });

  /** The fields the poller used to throw away have to survive the move. */
  it('carries what Ad Astra said about the booking into history', async () => {
    await reservations.upsertReservation(booking({
      section_id: 'S-9', instructor: 'R Garcia', activity_type: 'EXAM',
    }));
    await reservations.archiveExpiredReservations();

    const [kept] = await reservations.getHistoryOverlapping('2020-01-01 00:00:00', '2020-12-31 00:00:00');
    expect(kept.activity_id).toBe('A-1001');
    expect(kept.parent_activity_id).toBe('P-77');
    expect(kept.activity_type).toBe('EXAM');
    expect(kept.section_id).toBe('S-9');
    expect(kept.instructor).toBe('R Garcia');
  });

  /**
   * The reason history normalises its text at all. Two meetings of one series carry the
   * same name, and that name is written once however many times it is used.
   */
  it('writes a repeated name once, however many bookings carry it', async () => {
    await reservations.upsertReservation(booking({ start_time: '2020-03-01 09:00:00', end_time: '2020-03-01 10:00:00' }));
    await reservations.upsertReservation(booking({ start_time: '2020-03-08 09:00:00', end_time: '2020-03-08 10:00:00' }));
    await reservations.upsertReservation(booking({ start_time: '2020-03-15 09:00:00', end_time: '2020-03-15 10:00:00' }));
    await reservations.archiveExpiredReservations();

    const conn = await mysql.createConnection(testDbConfig);
    const [[{ names }]] = await conn.query(
      "SELECT COUNT(*) AS names FROM Facility_Text WHERE value = 'Soldering night'");
    const [[{ kept }]] = await conn.query('SELECT COUNT(*) AS kept FROM Facility_Reservation_History');
    await conn.end();

    expect(kept).toBe(3);
    expect(names).toBe(1);
  });

  /**
   * Two long names that agree for the length of the dictionary column resolve to one
   * shortened name. That is a merge somebody can see. The failure worth preventing is the
   * other one, where a value is stored truncated, looked up whole, matches nothing, and the
   * booking is silently recorded as having had no name at all.
   */
  it('gives a name too long for the dictionary a name rather than nothing', async () => {
    const long = 'A'.repeat(180) + ' first ending';
    await reservations.upsertReservation(booking({ event_name: long }));
    await reservations.archiveExpiredReservations();

    const [kept] = await reservations.getHistoryOverlapping('2020-01-01 00:00:00', '2020-12-31 00:00:00');
    expect(kept.event_name).toBeTruthy();
    expect(kept.event_name.startsWith('AAAA')).toBe(true);
  });

  /** A dictionary shared across archive runs, not just within one. */
  it('reuses a name it already wrote on an earlier run', async () => {
    await reservations.upsertReservation(booking());
    await reservations.archiveExpiredReservations();
    await reservations.upsertReservation(booking({ start_time: '2020-03-08 09:00:00', end_time: '2020-03-08 10:00:00' }));
    await reservations.archiveExpiredReservations();

    const conn = await mysql.createConnection(testDbConfig);
    const [[{ names }]] = await conn.query(
      "SELECT COUNT(*) AS names FROM Facility_Text WHERE value = 'Soldering night'");
    await conn.end();
    expect(names).toBe(1);
  });

  /**
   * A booking that finished earlier today is still in every poll for the rest of the day,
   * because Ad Astra is asked for everything from midnight of the current day onwards.
   * Archiving it now would move it to history, let the next poll put it back, and write it
   * to history again on the poll after that.
   */
  it('leaves a booking that finished earlier today where it is', async () => {
    const { campusStartOfToday } = await import('../../lib/timezone.js');
    const today = campusStartOfToday().slice(0, 10);
    const start = `${today} 00:05:00`;
    const end = `${today} 00:10:00`;

    await reservations.upsertReservation(booking({ start_time: start, end_time: end }));
    await reservations.archiveExpiredReservations();

    expect(await reservations.findReservation(1, start, end)).toBeTruthy();
    expect(await reservations.countHistory()).toBe(0);
  });

  /**
   * The same booking archived twice is the failure that matters here, so the run is made
   * twice over on purpose and history is counted rather than merely read.
   */
  it('writes a booking to history once, however many times the archive runs', async () => {
    await reservations.upsertReservation(booking());
    await reservations.archiveExpiredReservations();
    await reservations.archiveExpiredReservations();

    expect(await reservations.countHistory()).toBe(1);
  });

  /** The pollers call this every cycle, so a run with nothing to move is the common case. */
  it('does nothing and refuses nothing when there is nothing to move', async () => {
    await expect(reservations.archiveExpiredReservations()).resolves.not.toThrow();
    expect(await reservations.getHistoryOverlapping('2020-01-01 00:00:00', '2020-12-31 00:00:00')).toEqual([]);
  });

  /** A booking with no name and no customer is still worth keeping. */
  it('keeps a booking that carries no text at all', async () => {
    await reservations.upsertReservation(booking({
      customer: '', event_name: '', activity_id: null, parent_activity_id: null,
      activity_type: null,
    }));
    await reservations.archiveExpiredReservations();

    const [kept] = await reservations.getHistoryOverlapping('2020-01-01 00:00:00', '2020-12-31 00:00:00');
    expect(kept).toBeTruthy();
    expect(kept.event_name).toBe(null);
  });

  /**
   * How long one source took to agree with the other is the question these two columns
   * exist for, so they have to survive the move as well.
   */
  it('records when each source first showed a booking, and keeps that', async () => {
    await reservations.upsertReservation(booking({ source: 'astra' }));
    await reservations.upsertReservation(booking({ source: 'tableau', customer: 'IEEE' }));

    const working = await reservations.findReservation(1, PAST.start, PAST.end);
    expect(working.astra_first_seen).toBeTruthy();
    expect(working.tableau_first_seen).toBeTruthy();

    await reservations.archiveExpiredReservations();
    const [kept] = await reservations.getHistoryOverlapping('2020-01-01 00:00:00', '2020-12-31 00:00:00');
    expect(kept.astra_first_seen).toBeTruthy();
    expect(kept.tableau_first_seen).toBeTruthy();
  });

  /** The first sighting is the first one, so a second poll does not move it. */
  it('does not move the first sighting when the same source reports again', async () => {
    await reservations.upsertReservation(booking({ source: 'astra' }));
    const first = await reservations.findReservation(1, PAST.start, PAST.end);

    await reservations.upsertReservation(booking({ source: 'astra' }));
    const second = await reservations.findReservation(1, PAST.start, PAST.end);

    expect(second.astra_first_seen).toBe(first.astra_first_seen);
  });
});

/**
 * When an organizer entered an event.
 *
 * Nullable and not backfilled on purpose. A row older than the migration has an unknown
 * creation time, and the honest record of that is nothing rather than the moment the
 * deploy happened.
 */
describe('when an event was entered', () => {
  afterAll(async () => {
    const pool = (await import('../../db/pool.js')).default;
    await pool.end();
  });

  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
  }, 180_000);

  it('is recorded for an event written from now on', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('t', 'T', 't@illinois.edu')");
    await conn.query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private)
       VALUES (1, 't', 'Written now', '2027-03-01 18:00:00', '2027-03-01 19:00:00', 0)`);
    const [[row]] = await conn.query('SELECT created_at FROM Events WHERE title = ?', ['Written now']);
    await conn.end();

    expect(row.created_at).toBeTruthy();
  });

  it('is nothing at all for a row that predates the column', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private, created_at)
       VALUES (1, 't', 'Older than the column', '2027-03-02 18:00:00', '2027-03-02 19:00:00', 0, NULL)`);
    const [[row]] = await conn.query('SELECT created_at FROM Events WHERE title = ?', ['Older than the column']);
    await conn.end();

    expect(row.created_at).toBe(null);
  });
});
