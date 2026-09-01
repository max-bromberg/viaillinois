import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let events;

/**
 * A sitemap lists every public page, not the first page of them. The feed
 * query paginates at twenty, so using it here silently stopped submitting
 * events past the first screenful.
 */
describe('sitemap entries', () => {
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
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('t', 'T', 't@illinois.edu')");
    const rows = Array.from({ length: 25 }, (_, i) =>
      `(1, 't', 'Event ${i}', '2027-03-01 18:00:00', '2027-03-01 19:00:00', 0)`).join(',');
    await conn.query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private) VALUES ${rows}`);
    await conn.query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private)
       VALUES (1, 't', 'Internal', '2027-03-02 18:00:00', '2027-03-02 19:00:00', 1)`);
    await conn.end();
  });

  it('returns every public event, past the first page of the feed', async () => {
    expect(await events.getPublicEventSitemapEntries()).toHaveLength(25);
  });

  /** An internal event is not for the public and must not be submitted. */
  it('leaves out events marked internal', async () => {
    const entries = await events.getPublicEventSitemapEntries();
    expect(entries.map(e => e.title ?? '')).not.toContain('Internal');
    expect(entries).toHaveLength(25);
  });

  it('carries what a sitemap entry needs and nothing more', async () => {
    const [entry] = await events.getPublicEventSitemapEntries();
    expect(Object.keys(entry).sort()).toEqual(['event_id', 'start_time']);
  });

  it('respects a limit, because a sitemap has one', async () => {
    expect(await events.getPublicEventSitemapEntries(10)).toHaveLength(10);
  });
});
