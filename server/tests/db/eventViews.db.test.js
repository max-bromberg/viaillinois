import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let query;
let addViews;
let getViewsByRso;
let getViewTotalByRso;

/**
 * Readings are counted in memory and written once a minute as aggregates, so
 * two writes inside the same day have to add rather than collide, exactly as
 * the refusal counts do.
 *
 * The table holds an event, a day and a number, and nothing else. That is the
 * whole privacy property: there is no column an address, a hash of one or a
 * session could be put in, so no later change can quietly start keeping one
 * without a migration somebody has to read.
 */
describe('Event_Views', () => {
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
    ({ query } = await import('../../db/pool.js'));
    ({ addViews, getViewsByRso, getViewTotalByRso } = await import('../../db/queries/eventViews.ts'));
  }, 180_000);

  afterAll(async () => {
    const pool = (await import('../../db/pool.js')).default;
    await pool.end();
  });

  /** One organization, two of its events, and one belonging to somebody else. */
  beforeEach(async () => {
    await query('DELETE FROM Event_Views');
    await query('DELETE FROM Events');
    await query('DELETE FROM RSOs');
    await query('DELETE FROM Users');
    // Events.created_by is not null and names a user, so one has to exist
    // before any event can.
    await query("INSERT INTO Users (net_id, full_name, email) VALUES ('board1', 'Board', 'b@illinois.edu')");
    await query("INSERT INTO RSOs (rso_id, name) VALUES (3, 'Design Club'), (4, 'Robotics')");
    await query(
      `INSERT INTO Events (event_id, rso_id, created_by, title, start_time, end_time, is_private)
       VALUES (7, 3, 'board1', 'Design Review', '2026-09-20 18:00:00', '2026-09-20 19:00:00', 0),
              (8, 3, 'board1', 'Socials',       '2026-09-22 18:00:00', '2026-09-22 19:00:00', 0),
              (9, 4, 'board1', 'Build Night',   '2026-09-23 18:00:00', '2026-09-23 19:00:00', 0)`
    );
  });

  it('records a reading', async () => {
    await addViews([{ eventId: 7, day: '2026-09-14', viewCount: 3 }]);
    const rows = await query('SELECT * FROM Event_Views');
    expect(rows).toHaveLength(1);
    expect(rows[0].view_count).toBe(3);
  });

  it('adds a second write into the same day rather than colliding', async () => {
    await addViews([{ eventId: 7, day: '2026-09-14', viewCount: 3 }]);
    await addViews([{ eventId: 7, day: '2026-09-14', viewCount: 5 }]);
    const rows = await query('SELECT * FROM Event_Views');
    expect(rows).toHaveLength(1);
    expect(rows[0].view_count).toBe(8);
  });

  it('keeps one day apart from the next', async () => {
    await addViews([
      { eventId: 7, day: '2026-09-14', viewCount: 3 },
      { eventId: 7, day: '2026-09-15', viewCount: 4 },
    ]);
    expect(await query('SELECT * FROM Event_Views')).toHaveLength(2);
  });

  it('adds a day up across the days when a board asks about the event', async () => {
    await addViews([
      { eventId: 7, day: '2026-09-14', viewCount: 3 },
      { eventId: 7, day: '2026-09-15', viewCount: 4 },
      { eventId: 8, day: '2026-09-15', viewCount: 1 },
    ]);
    const rows = await getViewsByRso(3);
    expect(rows.map(row => [row.eventId, row.viewCount])).toEqual([[7, 7], [8, 1]]);
  });

  it('answers about one organization rather than about every one', async () => {
    await addViews([
      { eventId: 7, day: '2026-09-14', viewCount: 3 },
      { eventId: 9, day: '2026-09-14', viewCount: 99 },
    ]);
    expect(await getViewTotalByRso(3)).toBe(3);
    expect(await getViewTotalByRso(4)).toBe(99);
  });

  it('leaves out what happened before the window a board asked for', async () => {
    await addViews([
      { eventId: 7, day: '2026-01-01', viewCount: 40 },
      { eventId: 7, day: '2026-09-14', viewCount: 2 },
    ]);
    expect(await getViewTotalByRso(3, { since: '2026-09-01' })).toBe(2);
  });

  it('forgets the readings of an event that is deleted', async () => {
    await addViews([{ eventId: 7, day: '2026-09-14', viewCount: 3 }]);
    await query('DELETE FROM Events WHERE event_id = 7');
    expect(await query('SELECT * FROM Event_Views')).toHaveLength(0);
  });

  it('stores nothing about the reader, in any column', async () => {
    const columns = await query(
      `SELECT column_name AS name FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'Event_Views'`
    );
    expect(columns.map(column => column.name).sort()).toEqual(['day', 'event_id', 'view_count']);
  });
});
