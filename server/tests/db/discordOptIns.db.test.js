import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let optIns;

/**
 * The mirror of what a linked person asked to be told about.
 *
 * Subscriptions and Reminders in via_bot are the record, because the bot is
 * what sends the messages. These rows exist so the website can offer the same
 * two choices from the pages somebody is already reading, and show what they
 * chose before.
 *
 * What is held here is that every write is safe to repeat, because the same
 * choice arrives twice (once from the person pressing the control and again
 * from the bot reporting what it has), that a report replaces rather than
 * merges, and that unlinking takes everything with it.
 */
describe('what a linked person asked to be told about', () => {
  const DISCORD = '204255221017214977';

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
    optIns = await import('../../db/queries/discordOptIns.ts');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Discord_Rso_Follows');
    await conn.query('DELETE FROM Discord_Event_Reminders');
    await conn.query('DELETE FROM Discord_Links');
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM RSOs');
    await conn.query('DELETE FROM Users');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE'), (2, 'HKN')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('t', 'T', 't@illinois.edu')");
    await conn.query(
      `INSERT INTO Events (event_id, rso_id, created_by, title, start_time, end_time, is_private)
       VALUES (5, 1, 't', 'PCB night', '2027-03-01 18:00:00', '2027-03-01 19:00:00', 0),
              (6, 1, 't', 'Socket night', '2027-03-02 18:00:00', '2027-03-02 19:00:00', 0)`);
    await conn.query(
      "INSERT INTO Discord_Links (discord_user_id, net_id) VALUES (?, 't')", [DISCORD]);
    await conn.end();
  });

  it('is nothing at all before anybody has chosen', async () => {
    expect(await optIns.getFollowsFor(DISCORD)).toEqual([]);
    expect(await optIns.getRemindersFor(DISCORD)).toEqual([]);
  });

  it('records an organization somebody followed', async () => {
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: true });
    expect(await optIns.getFollowsFor(DISCORD)).toEqual([{ rso_id: 1 }]);
    expect(await optIns.isFollowing(DISCORD, 1)).toBe(true);
  });

  /** The same choice arrives twice, from the person and from the bot reporting. */
  it('takes the same follow twice without making a second row of it', async () => {
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: true });
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: true });
    expect(await optIns.getFollowsFor(DISCORD)).toHaveLength(1);
  });

  it('forgets one somebody stopped following, twice over if asked twice', async () => {
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: true });
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: false });
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: false });
    expect(await optIns.getFollowsFor(DISCORD)).toEqual([]);
  });

  it('records and withdraws a reminder about one event', async () => {
    await optIns.setReminder({ discordUserId: DISCORD, eventId: 5, wanted: true });
    expect(await optIns.hasReminder(DISCORD, 5)).toBe(true);

    await optIns.setReminder({ discordUserId: DISCORD, eventId: 5, wanted: false });
    expect(await optIns.hasReminder(DISCORD, 5)).toBe(false);
  });

  /**
   * A report is the whole of what the bot holds, so what it leaves out is what
   * the person stopped following. A merge could never express that.
   */
  it('replaces everything with what the bot reported, leaving nothing behind', async () => {
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: true });
    await optIns.setReminder({ discordUserId: DISCORD, eventId: 5, wanted: true });

    await optIns.replaceOptInsFor({
      discordUserId: DISCORD, following: [2], reminders: [6],
    });

    expect(await optIns.getFollowsFor(DISCORD)).toEqual([{ rso_id: 2 }]);
    expect(await optIns.getRemindersFor(DISCORD)).toEqual([{ event_id: 6 }]);
  });

  it('empties everything when the bot reports that they chose nothing', async () => {
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: true });
    await optIns.replaceOptInsFor({ discordUserId: DISCORD, following: [], reminders: [] });
    expect(await optIns.getFollowsFor(DISCORD)).toEqual([]);
  });

  /**
   * Somebody who unlinks should leave no record of what they followed. The
   * foreign key is what makes that true rather than a deletion somebody has to
   * remember to write.
   */
  it('goes when the link goes', async () => {
    await optIns.setFollow({ discordUserId: DISCORD, rsoId: 1, following: true });
    await optIns.setReminder({ discordUserId: DISCORD, eventId: 5, wanted: true });

    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Discord_Links WHERE discord_user_id = ?', [DISCORD]);
    await conn.end();

    expect(await optIns.getFollowsFor(DISCORD)).toEqual([]);
    expect(await optIns.getRemindersFor(DISCORD)).toEqual([]);
  });

  /** An event that is deleted takes the reminders about it with it. */
  it('forgets a reminder about an event that was deleted', async () => {
    await optIns.setReminder({ discordUserId: DISCORD, eventId: 5, wanted: true });

    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Events WHERE event_id = 5');
    await conn.end();

    expect(await optIns.getRemindersFor(DISCORD)).toEqual([]);
  });
});
