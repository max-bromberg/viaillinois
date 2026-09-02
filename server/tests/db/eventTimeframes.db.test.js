import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';
import { campusStartOfToday } from '../../lib/timezone.js';

let events;

const TODAY = campusStartOfToday().slice(0, 10);

/** A campus date a whole number of days from today, as YYYY-MM-DD. */
function campusDay(offset) {
  const [year, month, day] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

/**
 * The feed divides events at the start of the campus day. The unit suite pins
 * the statements, and this one checks what MySQL does with them, which is the
 * half that a comparison against the database container's own clock would get
 * wrong by five or six hours around the turn of the day.
 */
describe('event timeframes', () => {
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
    const { applyMigrations } = await import('../../db/migrate.ts');
    await resetTestDb();
    await applyMigrations();
    events = await import('../../db/queries/events.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('tester', 'T', 't@illinois.edu')");
    await conn.query(
      `INSERT INTO Events (event_id, rso_id, created_by, title, start_time, end_time, is_private) VALUES
        (1, 1, 'tester', 'Last week',        ?, ?, 0),
        (2, 1, 'tester', 'Yesterday evening', ?, ?, 0),
        (3, 1, 'tester', 'Midnight today',    ?, ?, 0),
        (4, 1, 'tester', 'Earlier today',     ?, ?, 0),
        (5, 1, 'tester', 'Tonight',           ?, ?, 0),
        (6, 1, 'tester', 'Next week',         ?, ?, 0),
        (7, 1, 'tester', 'Board meeting',     ?, ?, 1)`,
      [
        `${campusDay(-7)} 18:00:00`, `${campusDay(-7)} 19:00:00`,
        `${campusDay(-1)} 20:00:00`, `${campusDay(-1)} 21:00:00`,
        `${TODAY} 00:00:00`,         `${TODAY} 01:00:00`,
        `${TODAY} 09:00:00`,         `${TODAY} 10:00:00`,
        `${TODAY} 19:00:00`,         `${TODAY} 20:00:00`,
        `${campusDay(7)} 18:00:00`,  `${campusDay(7)} 19:00:00`,
        `${TODAY} 19:30:00`,         `${TODAY} 20:30:00`,
      ]
    );
    await conn.end();
  });

  const titles = rows => rows.map(row => row.title);

  describe('the public feed', () => {
    it('shows today and later, nearest first', async () => {
      const rows = await events.getPublicEvents({ timeframe: 'upcoming' });
      expect(titles(rows)).toEqual(['Midnight today', 'Earlier today', 'Tonight', 'Next week']);
    });

    /**
     * An event that started this morning is still today's event this
     * afternoon, and somebody who missed the start still wants to find it.
     */
    it('keeps an event that has already started but is on today', async () => {
      const rows = await events.getPublicEvents({ timeframe: 'upcoming' });
      expect(titles(rows)).toContain('Earlier today');
    });

    it('shows the archive most recent first', async () => {
      const rows = await events.getPublicEvents({ timeframe: 'archived' });
      expect(titles(rows)).toEqual(['Yesterday evening', 'Last week']);
    });

    it('shows every public event when asked for all of them', async () => {
      const rows = await events.getPublicEvents({ timeframe: 'all' });
      expect(rows).toHaveLength(6);
    });

    it('counts what it shows', async () => {
      const [upcoming] = await events.countPublicEvents({ timeframe: 'upcoming' });
      const [archived] = await events.countPublicEvents({ timeframe: 'archived' });
      expect(upcoming.total).toBe(4);
      expect(archived.total).toBe(2);
    });

    it('narrows a date range rather than widening the timeframe', async () => {
      const rows = await events.getPublicEvents({ timeframe: 'upcoming', startDate: `${campusDay(-30)} 00:00:00` });
      expect(titles(rows)).not.toContain('Last week');
    });
  });

  describe('the admin feed', () => {
    it('divides private events by the same boundary', async () => {
      const rows = await events.getAllEvents({ timeframe: 'upcoming' });
      expect(titles(rows)).toContain('Board meeting');
      expect(rows).toHaveLength(5);
    });

    it('counts what it shows', async () => {
      const [{ total }] = await events.countAllEvents({ timeframe: 'archived' });
      expect(total).toBe(2);
    });
  });

  describe('the feed a member sees', () => {
    it('divides their own RSO events by the same boundary', async () => {
      const rows = await events.getVisibleEvents({ timeframe: 'upcoming' }, [1]);
      expect(titles(rows)).toContain('Board meeting');
      expect(rows).toHaveLength(5);
    });

    it('counts what it shows', async () => {
      const [{ total }] = await events.countVisibleEvents({ timeframe: 'upcoming' }, [1]);
      expect(total).toBe(5);
    });
  });
});
