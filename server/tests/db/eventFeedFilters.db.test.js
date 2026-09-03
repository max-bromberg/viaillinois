import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let events;

/**
 * The feed's filter panel used to work by fetching every matching event and
 * sorting them out in the browser, which needed a request for ten thousand rows
 * and stopped working the moment one request was bounded. Both filters are
 * ordinary predicates, so they belong in the query, where the page the reader
 * asked for is the page the database builds.
 *
 * Doing it here also keeps an ordinary reader clear of the row budget. Filtering
 * in the browser charged them for every event in the term each time they
 * touched the filter panel, which is the shape of a collector rather than of
 * somebody looking for one club's talks.
 */
describe('event feed filters', () => {
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
    events = await import('../../db/queries/events.js');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('board1', 'Board', 'b@illinois.edu')");
    await conn.query("INSERT INTO RSOs (rso_id, name, description) VALUES (1, 'IEEE', 'x'), (2, 'HKN', 'y'), (3, 'ACM', 'z')");
    // Two events per RSO, one public and one private, all in the future.
    const rows = [];
    let id = 1;
    for (const rsoId of [1, 2, 3]) {
      for (const isPrivate of [0, 1]) {
        rows.push(`(${id}, ${rsoId}, 'board1', 'Event ${id}', '2099-03-0${id} 18:00:00', '2099-03-0${id} 20:00:00', ${isPrivate})`);
        id += 1;
      }
    }
    await conn.query(
      `INSERT INTO Events (event_id, rso_id, created_by, title, start_time, end_time, is_private)
       VALUES ${rows.join(',')}`
    );
    await conn.end();
  });

  const ALL = { timeframe: 'all', limit: 100, offset: 0 };

  describe('getPublicEvents', () => {
    it('returns every public event when no RSO is named', async () => {
      expect(await events.getPublicEvents({ ...ALL })).toHaveLength(3);
    });

    it('returns only the RSOs the reader picked', async () => {
      const rows = await events.getPublicEvents({ ...ALL, rsoIds: [1, 3] });
      expect(rows.map(e => e.rso_name).sort()).toEqual(['ACM', 'IEEE']);
    });

    it('counts the same set it lists', async () => {
      const [{ total }] = await events.countPublicEvents({ ...ALL, rsoIds: [1, 3] });
      expect(total).toBe(2);
    });

    it('treats an empty selection as no filter, not as nothing selected', async () => {
      expect(await events.getPublicEvents({ ...ALL, rsoIds: [] })).toHaveLength(3);
    });
  });

  describe('getAllEvents', () => {
    it('returns both public and private events by default', async () => {
      expect(await events.getAllEvents({ ...ALL })).toHaveLength(6);
    });

    it('leaves out the private ones when the reader asked it to', async () => {
      const rows = await events.getAllEvents({ ...ALL, excludePrivate: true });
      expect(rows).toHaveLength(3);
      expect(rows.every(e => e.is_private === 0)).toBe(true);
    });

    it('applies both filters together', async () => {
      const rows = await events.getAllEvents({ ...ALL, excludePrivate: true, rsoIds: [2] });
      expect(rows).toHaveLength(1);
      expect(rows[0].rso_name).toBe('HKN');
    });

    it('counts the same set it lists', async () => {
      const [{ total }] = await events.countAllEvents({ ...ALL, excludePrivate: true, rsoIds: [2] });
      expect(total).toBe(1);
    });
  });

  describe('getVisibleEvents', () => {
    it('shows a member the private events of their own RSO and no others', async () => {
      const rows = await events.getVisibleEvents({ ...ALL }, [1]);
      // Three public, plus IEEE's private one.
      expect(rows).toHaveLength(4);
    });

    it('narrows to the RSOs the reader picked, membership included', async () => {
      const rows = await events.getVisibleEvents({ ...ALL, rsoIds: [1] }, [1]);
      expect(rows).toHaveLength(2);
      expect(rows.every(e => e.rso_name === 'IEEE')).toBe(true);
    });

    it('drops the private ones when the reader asked it to', async () => {
      const rows = await events.getVisibleEvents({ ...ALL, excludePrivate: true }, [1]);
      expect(rows).toHaveLength(3);
      expect(rows.every(e => e.is_private === 0)).toBe(true);
    });

    it('counts the same set it lists', async () => {
      const [{ total }] = await events.countVisibleEvents({ ...ALL, rsoIds: [1] }, [1]);
      expect(total).toBe(2);
    });
  });

  describe('paging with a filter applied', () => {
    it('fills a page from the rows that survive the filter', async () => {
      // The whole point: the limit and the filter agree, so a first page of two
      // holds two matching events rather than two rows that the filter then
      // removed.
      const rows = await events.getPublicEvents({ ...ALL, limit: 2, offset: 0, rsoIds: [1, 2, 3] });
      expect(rows).toHaveLength(2);
    });

    it('pages through the filtered set rather than the whole one', async () => {
      const all = await events.getPublicEvents({ ...ALL, rsoIds: [1, 3] });
      const page = await events.getPublicEvents({ ...ALL, limit: 1, offset: 1, rsoIds: [1, 3] });
      expect(page.map(e => e.event_id)).toEqual([all[1].event_id]);
    });
  });
});
