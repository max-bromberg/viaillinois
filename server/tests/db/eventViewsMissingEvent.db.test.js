import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let query;
let addViews;
let getViewTotalByRso;

/**
 * A minute of readings is written as one statement, and one of the events it
 * names can have been deleted in the meantime.
 *
 * Event_Views carries a foreign key to Events, so a row naming a deleted event
 * makes MySQL reject the whole statement. The recorder catches that and drops
 * the buffer, which is the right answer to a database that is down and the
 * wrong one here: one editor deleting one of their own events would throw away
 * every organization's readings for that minute, and the insights tab would go
 * back to being the column of zeros this work exists to replace. Nobody would
 * read it as anything but a mysterious bug.
 *
 * The rows for events that still exist have to land, and the row for the one
 * that does not has to be dropped on its own.
 */
describe('Event_Views when an event was deleted mid minute', () => {
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
    ({ addViews, getViewTotalByRso } = await import('../../db/queries/eventViews.ts'));
  }, 120000);

  let rsoId;
  let liveEventId;

  beforeEach(async () => {
    await query('DELETE FROM Event_Views');
    await query('DELETE FROM Events');
    await query('DELETE FROM RSOs');
    await query('DELETE FROM Users');
    await query("INSERT INTO Users (net_id, name, email) VALUES ('boss', 'Boss', 'boss@illinois.edu')");
    const rso = await query(
      "INSERT INTO RSOs (name, description, created_by) VALUES ('IEEE', 'Electrical engineers', 'boss')"
    );
    rsoId = rso.insertId;
    const live = await query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private)
       VALUES (?, 'boss', 'Weekly meeting', '2026-09-16 19:00:00', '2026-09-16 20:00:00', 0)`,
      [rsoId]
    );
    liveEventId = live.insertId;
  });

  it('writes the readings for the events that are still there', async () => {
    const gone = liveEventId + 9999;
    await addViews([
      { eventId: liveEventId, day: '2026-09-16', viewCount: 4 },
      { eventId: gone, day: '2026-09-16', viewCount: 7 },
    ]);
    const total = await getViewTotalByRso(rsoId);
    expect(Number(total)).toBe(4);
  });

  it('does not throw, so the recorder never discards what it was holding', async () => {
    const gone = liveEventId + 9999;
    await expect(addViews([{ eventId: gone, day: '2026-09-16', viewCount: 1 }])).resolves.not.toThrow();
  });

  it('keeps no row for the event that is gone, so the table stays clean', async () => {
    const gone = liveEventId + 9999;
    await addViews([{ eventId: gone, day: '2026-09-16', viewCount: 1 }]);
    const rows = await query('SELECT event_id FROM Event_Views WHERE event_id = ?', [gone]);
    expect(rows).toHaveLength(0);
  });

  it('still adds to a day it has already counted rather than colliding with it', async () => {
    await addViews([{ eventId: liveEventId, day: '2026-09-16', viewCount: 3 }]);
    await addViews([
      { eventId: liveEventId, day: '2026-09-16', viewCount: 2 },
      { eventId: liveEventId + 9999, day: '2026-09-16', viewCount: 5 },
    ]);
    const total = await getViewTotalByRso(rsoId);
    expect(Number(total)).toBe(5);
  });
});
