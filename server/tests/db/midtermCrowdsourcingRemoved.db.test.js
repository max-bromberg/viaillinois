import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let conn;

/**
 * Midterm dates come from HKN rather than from students voting on them, so the
 * voting table and the trigger that confirmed a midterm once its score reached
 * five are gone.
 *
 * A midterm that arrives from HKN has no submitting user, so submitted_by has
 * to accept nothing. It stays a foreign key, because a midterm that someone did
 * submit should still point at a real account.
 */
describe('midterms without crowdsourcing', () => {
  beforeAll(async () => {
    await startTestDb();
    await resetTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    const { applyMigrations } = await import('../../db/migrate.ts');
    await applyMigrations();
    conn = await mysql.createConnection(testDbConfig);

    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'T', 't@illinois.edu')");
    await conn.query("INSERT INTO Courses (course_code, title) VALUES ('ECE 210', 'Analog Signal Processing')");
    await conn.query(
      "INSERT INTO Locations (location_id, building, room_number, max_capacity) VALUES (1, 'Everitt Laboratory', '2310', 45)"
    );
  }, 180_000);

  afterAll(async () => {
    if (conn) await conn.end();
  });

  it('has no votes table', async () => {
    const [rows] = await conn.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_name = 'Midterm_Votes'",
      [testDbConfig.database]
    );
    expect(rows).toHaveLength(0);
  });

  it('has no auto confirm trigger', async () => {
    const [rows] = await conn.query(
      'SELECT trigger_name AS n FROM information_schema.triggers WHERE trigger_schema = ?',
      [testDbConfig.database]
    );
    expect(rows.map(r => r.n)).not.toContain('trg_auto_confirm_midterm');
  });

  it('accepts a midterm with no submitting user', async () => {
    const [result] = await conn.query(
      `INSERT INTO Midterms (course_code, submitted_by, location_id, title, start_time, end_time, status)
       VALUES ('ECE 210', NULL, 1, 'ECE 210 Midterm 1', '2027-10-01 19:00:00', '2027-10-01 21:00:00', 'Confirmed')`
    );
    const [rows] = await conn.query('SELECT submitted_by FROM Midterms WHERE midterm_id = ?', [result.insertId]);
    expect(rows[0].submitted_by).toBeNull();
  });

  it('still records a submitting user when there is one', async () => {
    const [result] = await conn.query(
      `INSERT INTO Midterms (course_code, submitted_by, location_id, title, start_time, end_time)
       VALUES ('ECE 210', 'tester', 1, 'ECE 210 Midterm 2', '2027-11-01 19:00:00', '2027-11-01 21:00:00')`
    );
    const [rows] = await conn.query('SELECT submitted_by FROM Midterms WHERE midterm_id = ?', [result.insertId]);
    expect(rows[0].submitted_by).toBe('tester');
  });

  it('still refuses a submitting user who does not exist', async () => {
    await expect(conn.query(
      `INSERT INTO Midterms (course_code, submitted_by, location_id, title, start_time, end_time)
       VALUES ('ECE 210', 'ghost', 1, 'Nobody', '2027-12-01 19:00:00', '2027-12-01 21:00:00')`
    )).rejects.toThrow();
  });
});
