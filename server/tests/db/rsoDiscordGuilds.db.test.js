import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let guilds;

/**
 * The mirror of which Discord server an organization is bound to.
 *
 * The binding belongs to the bot: it is a fact about a Discord server, and
 * Guild_Installations in via_bot is the record of it. The website has no
 * account on that database and is not meant to have one, so the bot reports
 * each binding through the internal service API and the dashboard reads what
 * was reported.
 *
 * What is held here is that a report is idempotent, because the bot may report
 * the same binding more than once and a second report is not a second server,
 * and that a server moving from one organization to another leaves nothing
 * behind on the first.
 */
describe('the mirror of an organization\'s Discord server', () => {
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
    guilds = await import('../../db/queries/discordGuilds.ts');
  }, 180_000);

  beforeEach(async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Rso_Discord_Guilds');
    await conn.query('DELETE FROM Events');
    await conn.query('DELETE FROM RSOs');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE'), (2, 'HKN')");
    await conn.end();
  });

  const A_SERVER = {
    guildId: '204255221017214977',
    rsoId: 1,
    guildName: 'IEEE at Illinois',
    boundBy: '105555555555555555',
    boundAt: '2026-09-01 12:00:00',
  };

  it('is nothing at all for an organization nobody has bound a server to', async () => {
    expect(await guilds.getGuildsForRso(1)).toEqual([]);
  });

  it('carries what the dashboard names the server with', async () => {
    await guilds.reportBinding(A_SERVER);
    const [server] = await guilds.getGuildsForRso(1);
    expect(server.guild_id).toBe(A_SERVER.guildId);
    expect(server.guild_name).toBe('IEEE at Illinois');
    expect(server.bound_by).toBe(A_SERVER.boundBy);
  });

  /**
   * The bot reports what it has rather than what changed, so the same binding
   * arrives again whenever it re-reports. A second report is the same server.
   */
  it('takes the same binding twice without making a second server of it', async () => {
    await guilds.reportBinding(A_SERVER);
    await guilds.reportBinding({ ...A_SERVER, guildName: 'IEEE Illinois' });
    const found = await guilds.getGuildsForRso(1);
    expect(found).toHaveLength(1);
    expect(found[0].guild_name).toBe('IEEE Illinois');
  });

  /** A server rebound to another organization is not still on the first. */
  it('moves a server that was bound to another organization', async () => {
    await guilds.reportBinding(A_SERVER);
    await guilds.reportBinding({ ...A_SERVER, rsoId: 2 });
    expect(await guilds.getGuildsForRso(1)).toEqual([]);
    expect(await guilds.getGuildsForRso(2)).toHaveLength(1);
  });

  it('forgets a binding the bot says is gone', async () => {
    await guilds.reportBinding(A_SERVER);
    await guilds.forgetBinding(A_SERVER.guildId);
    expect(await guilds.getGuildsForRso(1)).toEqual([]);
  });

  it('forgets nothing and refuses nothing when the binding was already gone', async () => {
    await expect(guilds.forgetBinding('999999999999999999')).resolves.not.toThrow();
  });

  /**
   * An organization can run more than one server, a general one and a project
   * one among them, and the dashboard lists each of them.
   */
  it('carries every server bound to one organization', async () => {
    await guilds.reportBinding(A_SERVER);
    await guilds.reportBinding({ ...A_SERVER, guildId: '304255221017214977', guildName: 'IEEE Projects' });
    expect(await guilds.getGuildsForRso(1)).toHaveLength(2);
  });

  /** The organization going takes its bindings with it, by the foreign key. */
  it('goes when the organization goes', async () => {
    await guilds.reportBinding(A_SERVER);
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM RSOs WHERE rso_id = 1');
    await conn.end();
    expect(await guilds.getGuildsForRso(1)).toEqual([]);
  });
});
