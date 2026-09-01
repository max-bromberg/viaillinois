import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let midtermsDb;

/**
 * An admin needs to be able to remove a midterm outright, not only mark it
 * cancelled. A duplicate left behind by a calendar import, or an entry for an
 * exam that was never sat, is noise on a page students read to plan around,
 * and a cancelled row still occupies the admin listing forever.
 *
 * This is the first query written with Drizzle rather than raw SQL, which is
 * the direction the data layer is moving in.
 */
describe('deleteMidterm', () => {
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
    midtermsDb = await import('../../db/queries/midterms.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Midterms');
    await conn.query('DELETE FROM Courses');
    await conn.query("INSERT INTO Courses (course_code, title) VALUES ('ECE 110', 'Intro to Electronics')");
    await conn.query(
      `INSERT INTO Midterms (midterm_id, course_code, title, start_time, end_time, status)
       VALUES (1, 'ECE 110', 'Midterm 1', '2099-03-04 19:00:00', '2099-03-04 21:00:00', 'Confirmed'),
              (2, 'ECE 110', 'Midterm 2', '2099-04-08 19:00:00', '2099-04-08 21:00:00', 'Pending')`
    );
    await conn.end();
  });

  it('removes the midterm it names', async () => {
    const result = await midtermsDb.deleteMidterm(1);
    expect(result.affectedRows).toBe(1);
    const left = await midtermsDb.getAllMidtermsAdmin();
    expect(left.map(m => m.midterm_id)).toEqual([2]);
  });

  it('reports that it removed nothing when the midterm is not there', async () => {
    const result = await midtermsDb.deleteMidterm(999);
    expect(result.affectedRows).toBe(0);
    const left = await midtermsDb.getAllMidtermsAdmin();
    expect(left).toHaveLength(2);
  });

  /**
   * A confirmed midterm is the one students actually read, and so the one an
   * admin most needs to be able to withdraw. Midterm 1 is the confirmed one
   * here; midterm 2 is pending and so never appears in that listing at all.
   * The state before the delete is asserted as well, so a fixture that drifts
   * says so rather than looking like a broken delete.
   */
  it('takes a confirmed midterm out of the listing students read', async () => {
    const before = await midtermsDb.getConfirmedMidterms();
    expect(before.map(m => m.midterm_id)).toEqual([1]);

    await midtermsDb.deleteMidterm(1);

    expect(await midtermsDb.getConfirmedMidterms()).toHaveLength(0);
    // The pending one is untouched, so the delete took only what it named.
    const left = await midtermsDb.getAllMidtermsAdmin();
    expect(left.map(m => m.midterm_id)).toEqual([2]);
  });
});
