import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let conn;

/**
 * Importing a calendar twice has to update what it created the first time
 * rather than duplicate it, so imported rows carry the identifier the calendar
 * gave them.
 */
describe('calendar import schema', () => {
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

    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE'), (2, 'HKN')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'T', 't@illinois.edu')");
    await conn.query("INSERT INTO Courses (course_code, title) VALUES ('ECE 210', 'Analog')");
  }, 180_000);

  afterAll(async () => {
    if (conn) await conn.end();
  });

  const insertEvent = (rsoId, uid, title) => conn.query(
    `INSERT INTO Events (rso_id, created_by, external_uid, title, start_time, end_time)
     VALUES (?, 'tester', ?, ?, '2027-04-01 18:00:00', '2027-04-01 19:00:00')`,
    [rsoId, uid, title]
  );

  it('refuses two events with the same calendar identifier in one RSO', async () => {
    await insertEvent(1, 'shared-uid', 'First');
    await expect(insertEvent(1, 'shared-uid', 'Second')).rejects.toThrow();
  });

  /**
   * Two RSOs can publish calendars that happen to reuse an identifier, and
   * neither should block the other, so the key is scoped to the RSO.
   */
  it('allows the same calendar identifier in a different RSO', async () => {
    await expect(insertEvent(2, 'shared-uid', 'Theirs')).resolves.toBeTruthy();
  });

  it('allows many events with no calendar identifier, which are entered by hand', async () => {
    await insertEvent(1, null, 'By hand one');
    await expect(insertEvent(1, null, 'By hand two')).resolves.toBeTruthy();
  });

  it('refuses two midterms with the same calendar identifier', async () => {
    await conn.query(
      `INSERT INTO Midterms (course_code, external_uid, title, start_time, end_time)
       VALUES ('ECE 210', 'hkn-1', 'Midterm 1', '2027-10-01 19:00:00', '2027-10-01 21:00:00')`
    );
    await expect(conn.query(
      `INSERT INTO Midterms (course_code, external_uid, title, start_time, end_time)
       VALUES ('ECE 210', 'hkn-1', 'Duplicate', '2027-10-02 19:00:00', '2027-10-02 21:00:00')`
    )).rejects.toThrow();
  });

  /**
   * A midterm from HKN names its room as free text, and that text will often
   * match no room record, so the midterm needs the same optional location the
   * events got.
   */
  it('accepts a midterm whose location is free text', async () => {
    const [result] = await conn.query(
      `INSERT INTO Midterms (course_code, location_id, location_text, title, start_time, end_time)
       VALUES ('ECE 210', NULL, 'Off campus testing centre', 'Conflict exam', '2027-10-03 19:00:00', '2027-10-03 21:00:00')`
    );
    const [rows] = await conn.query(
      'SELECT location_id, location_text FROM Midterms WHERE midterm_id = ?', [result.insertId]
    );
    expect(rows[0].location_id).toBeNull();
    expect(rows[0].location_text).toBe('Off campus testing centre');
  });
});
