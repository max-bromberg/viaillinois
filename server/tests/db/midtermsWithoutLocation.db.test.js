import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let midterms;

/**
 * A midterm imported from HKN names its room as free text, and that text often
 * matches no room record, so its location_id is null. Every midterm listing
 * joined Locations to get the building and room, and an inner join drops
 * exactly those rows: the import would report success and the midterms would
 * never appear anywhere.
 */
describe('midterms without a room', () => {

  /**
   * The shared connection pool has to be closed when this suite is done.
   * Database suites run one after another in one process, and a later suite
   * that drops and recreates the database leaves any connection still open
   * here pointing at something that no longer exists, which then fails a
   * completely unrelated test.
   */
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
    midterms = await import('../../db/queries/midterms.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Midterms');
    await conn.query('DELETE FROM Locations');
    await conn.query('DELETE FROM Courses');
    await conn.query("INSERT INTO Courses (course_code, title) VALUES ('ECE 210', 'Analog')");
    await conn.query(
      "INSERT INTO Locations (location_id, building, room_number, max_capacity) VALUES (1, 'Everitt Laboratory', '2310', 45)"
    );
    await conn.query(`
      INSERT INTO Midterms (midterm_id, course_code, location_id, location_text, title, start_time, end_time, status) VALUES
        (1, 'ECE 210', 1,    NULL,                  'In a room',  '2027-10-01 19:00:00', '2027-10-01 21:00:00', 'Confirmed'),
        (2, 'ECE 210', NULL, 'Conflict exam room',  'Free text',  '2027-10-02 19:00:00', '2027-10-02 21:00:00', 'Confirmed'),
        (3, 'ECE 210', NULL, NULL,                  'Undecided',  '2027-10-03 19:00:00', '2027-10-03 21:00:00', 'Confirmed')`);
    await conn.end();
  });

  it('lists all three on the midterms page', async () => {
    const rows = await midterms.getMidterms({});
    expect(rows.map(r => r.title).sort()).toEqual(['Free text', 'In a room', 'Undecided']);
  });

  it('carries the free text through to the listing', async () => {
    const rows = await midterms.getMidterms({});
    expect(rows.find(r => r.title === 'Free text').location_text).toBe('Conflict exam room');
  });

  it('still carries the room for the one that has one', async () => {
    const rows = await midterms.getMidterms({});
    expect(rows.find(r => r.title === 'In a room').building).toBe('Everitt Laboratory');
  });

  it('lists all three on the calendar of confirmed midterms', async () => {
    expect(await midterms.getConfirmedMidterms()).toHaveLength(3);
  });

  it('lists all three for an admin', async () => {
    expect(await midterms.getAllMidtermsAdmin()).toHaveLength(3);
  });

  it('offers all three to the scheduler, which avoids clashing with them', async () => {
    expect(await midterms.getConfirmedMidtermsForScheduler({})).toHaveLength(3);
  });
});
