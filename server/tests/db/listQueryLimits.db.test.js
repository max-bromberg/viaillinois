import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let midtermsDb, coursesDb, rsoDb;

/**
 * Four list endpoints validated a page and then returned the whole table
 * anyway, because the queries behind them took no limit. A ceiling that does
 * not reach the database is a ceiling in name only, so these push the bound and
 * the campus date filter down into the SQL together.
 *
 * The date filter has to move with the limit rather than after it. Filtering in
 * JavaScript once the rows have arrived means a LIMIT applied first would cut
 * the page before the filter ran, and the caller would get a short page or an
 * empty one while rows it should have seen sat behind the cut.
 */
describe('list queries that carry a bound', () => {
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
    coursesDb = await import('../../db/queries/courses.js');
    rsoDb = await import('../../db/queries/rso.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Midterms');
    await conn.query('DELETE FROM Courses');
    await conn.query('DELETE FROM RSOs');
    const courses = Array.from({ length: 12 }, (_, i) =>
      `('ECE ${100 + i}', 'Course ${100 + i}')`).join(',');
    await conn.query(`INSERT INTO Courses (course_code, title) VALUES ${courses}`);
    // Six exams well in the future and three that finished in 2020, so the
    // campus date filter has something to exclude.
    const upcoming = Array.from({ length: 6 }, (_, i) =>
      `(${i + 1}, 'ECE 110', 'Upcoming ${i}', '2099-03-0${i + 1} 19:00:00', '2099-03-0${i + 1} 21:00:00', 'Confirmed')`).join(',');
    const past = Array.from({ length: 3 }, (_, i) =>
      `(${i + 20}, 'ECE 110', 'Past ${i}', '2020-03-0${i + 1} 19:00:00', '2020-03-0${i + 1} 21:00:00', 'Confirmed')`).join(',');
    await conn.query(
      `INSERT INTO Midterms (midterm_id, course_code, title, start_time, end_time, status)
       VALUES ${past},${upcoming}`
    );
    const rsos = Array.from({ length: 9 }, (_, i) =>
      `(${i + 1}, 'RSO ${i}', 'Description ${i}')`).join(',');
    await conn.query(`INSERT INTO RSOs (rso_id, name, description) VALUES ${rsos}`);
    await conn.end();
  });

  describe('getMidterms', () => {
    it('returns every matching row when no bound is asked for', async () => {
      expect(await midtermsDb.getMidterms({})).toHaveLength(9);
    });

    it('returns no more rows than the limit', async () => {
      expect(await midtermsDb.getMidterms({ limit: 4 })).toHaveLength(4);
    });

    it('pages with an offset', async () => {
      const all = await midtermsDb.getMidterms({});
      const page = await midtermsDb.getMidterms({ limit: 3, offset: 3 });
      expect(page.map(m => m.midterm_id)).toEqual(all.slice(3, 6).map(m => m.midterm_id));
    });

    it('drops the exams that already finished, in SQL rather than afterwards', async () => {
      const rows = await midtermsDb.getMidterms({ endingOnOrAfter: '2026-09-03 00:00:00' });
      expect(rows).toHaveLength(6);
      expect(rows.every(m => m.title.startsWith('Upcoming'))).toBe(true);
    });

    it('fills a page from the rows that survive the filter, not from the ones cut', async () => {
      // Without the filter in SQL, a limit of three would take the three past
      // exams first and then hide them, leaving the caller an empty page.
      const rows = await midtermsDb.getMidterms({
        endingOnOrAfter: '2026-09-03 00:00:00', limit: 3,
      });
      expect(rows).toHaveLength(3);
      expect(rows.every(m => m.title.startsWith('Upcoming'))).toBe(true);
    });

    it('still filters by course code', async () => {
      expect(await midtermsDb.getMidterms({ courseCode: 'ECE 999' })).toHaveLength(0);
    });
  });

  describe('getConfirmedMidterms', () => {
    it('returns every confirmed row when no bound is asked for', async () => {
      expect(await midtermsDb.getConfirmedMidterms()).toHaveLength(6);
    });

    it('returns no more rows than the limit', async () => {
      expect(await midtermsDb.getConfirmedMidterms({ limit: 2 })).toHaveLength(2);
    });
  });

  describe('getCourses', () => {
    it('returns every course when no bound is asked for', async () => {
      expect(await coursesDb.getCourses()).toHaveLength(12);
    });

    it('returns no more rows than the limit', async () => {
      expect(await coursesDb.getCourses({ limit: 5 })).toHaveLength(5);
    });

    it('pages with an offset', async () => {
      const page = await coursesDb.getCourses({ limit: 2, offset: 2 });
      expect(page.map(c => c.course_code)).toEqual(['ECE 102', 'ECE 103']);
    });
  });

  describe('getAllRsos', () => {
    it('returns every RSO when no bound is asked for', async () => {
      expect(await rsoDb.getAllRsos()).toHaveLength(9);
    });

    it('returns no more rows than the limit', async () => {
      expect(await rsoDb.getAllRsos({ limit: 4 })).toHaveLength(4);
    });

    it('pages with an offset', async () => {
      const all = await rsoDb.getAllRsos();
      const page = await rsoDb.getAllRsos({ limit: 3, offset: 6 });
      expect(page.map(r => r.rso_id)).toEqual(all.slice(6, 9).map(r => r.rso_id));
    });
  });
});
