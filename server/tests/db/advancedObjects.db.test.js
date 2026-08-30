import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let conn;

describe('advanced database objects', () => {
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
  }, 180_000);

  afterAll(async () => {
    if (conn) await conn.end();
  });

  it('creates the midterm auto-confirm trigger', async () => {
    const [rows] = await conn.query(
      'SELECT trigger_name AS n FROM information_schema.triggers WHERE trigger_schema = ?',
      [testDbConfig.database]
    );
    expect(rows.map(r => r.n)).toContain('trg_auto_confirm_midterm');
  });

  it('creates the GetRSOStats procedure', async () => {
    const [rows] = await conn.query(
      "SELECT routine_name AS n FROM information_schema.routines WHERE routine_schema = ? AND routine_type = 'PROCEDURE'",
      [testDbConfig.database]
    );
    expect(rows.map(r => r.n)).toContain('GetRSOStats');
  });

  it('GetRSOStats is callable and returns two result sets', async () => {
    const [results] = await conn.query('CALL GetRSOStats(?)', [1]);
    expect(Array.isArray(results[0])).toBe(true);
    expect(Array.isArray(results[1])).toBe(true);
  });

  /**
   * The trigger failing is silent: a midterm simply never reaches Confirmed and
   * nothing reports it. Checking that the object exists would not have caught
   * that, so this drives it with real votes.
   */
  describe('the trigger confirms a midterm once its score reaches five', () => {
    let midtermId;

    beforeAll(async () => {
      await conn.query(
        'INSERT INTO Locations (building, room_number, max_capacity) VALUES (?, ?, ?)',
        ['ECEB', '1002', 200]
      );
      const [loc] = await conn.query('SELECT location_id AS id FROM Locations LIMIT 1');
      await conn.query('INSERT INTO Courses (course_code, title) VALUES (?, ?)',
        ['ECE 411', 'Computer Organization and Design']);
      for (let i = 0; i < 6; i++) {
        await conn.query(
          'INSERT INTO Users (net_id, full_name, email) VALUES (?, ?, ?)',
          [`voter${i}`, `Voter ${i}`, `voter${i}@illinois.edu`]
        );
      }
      await conn.query(
        `INSERT INTO Midterms (course_code, submitted_by, location_id, title, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['ECE 411', 'voter0', loc[0].id, 'ECE 411 Midterm 1',
         '2026-10-01 19:00:00', '2026-10-01 21:00:00']
      );
      const [mid] = await conn.query('SELECT midterm_id AS id FROM Midterms LIMIT 1');
      midtermId = mid[0].id;
    }, 60_000);

    async function status() {
      const [rows] = await conn.query(
        'SELECT status AS s FROM Midterms WHERE midterm_id = ?', [midtermId]);
      return rows[0].s;
    }

    it('leaves the midterm pending below the threshold', async () => {
      for (let i = 0; i < 4; i++) {
        await conn.query(
          'INSERT INTO Midterm_Votes (midterm_id, net_id, vote_value) VALUES (?, ?, 1)',
          [midtermId, `voter${i}`]
        );
      }
      expect(await status()).toBe('Pending');
    });

    it('confirms the midterm when the fifth upvote arrives', async () => {
      await conn.query(
        'INSERT INTO Midterm_Votes (midterm_id, net_id, vote_value) VALUES (?, ?, 1)',
        [midtermId, 'voter4']
      );
      expect(await status()).toBe('Confirmed');
    });
  });
});
