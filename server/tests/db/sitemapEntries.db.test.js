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

  /**
   * updated_at rather than start_time, because a sitemap entry carries a
   * lastmod and lastmod means when the page changed. Publishing the hour the
   * event starts at claimed that every event still to come had been modified
   * in the future, and Google ignores a lastmod it cannot believe, across the
   * whole file rather than for the one entry.
   */
  it('carries what a sitemap entry needs and nothing more', async () => {
    const [entry] = await events.getPublicEventSitemapEntries();
    expect(Object.keys(entry).sort()).toEqual(['event_id', 'updated_at']);
  });

  it('respects a limit, because a sitemap has one', async () => {
    expect(await events.getPublicEventSitemapEntries(10)).toHaveLength(10);
  });

  /**
   * A cancelled event stays on the site, so that somebody who planned to go is
   * told, and its listing says so. There is nothing in it for a searcher who
   * arrived from a result, and nothing for VIA in asking a crawler to keep
   * coming back to it.
   */
  it('leaves out an event that was called off', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private, cancelled_at)
       VALUES (1, 't', 'Called off', '2027-03-03 18:00:00', '2027-03-03 19:00:00', 0,
               '2026-09-01 12:00:00')`);
    await conn.end();

    expect(await events.getPublicEventSitemapEntries()).toHaveLength(25);
  });

  /**
   * An event from three years ago is a page worth keeping and not one worth
   * asking a search engine to come back for, and a small site has a crawl
   * budget to spend on what people are looking for. Eleven months and thirteen
   * months, rather than either side of exactly twelve, so that the test is
   * about the reach rather than about the boundary.
   */
  it('reaches back a year, and no further', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private)
       VALUES (1, 't', 'Long over',
               DATE_SUB(NOW(), INTERVAL 13 MONTH),
               DATE_ADD(DATE_SUB(NOW(), INTERVAL 13 MONTH), INTERVAL 1 HOUR), 0)`);
    await conn.query(
      `INSERT INTO Events (rso_id, created_by, title, start_time, end_time, is_private)
       VALUES (1, 't', 'Still listed',
               DATE_SUB(NOW(), INTERVAL 11 MONTH),
               DATE_ADD(DATE_SUB(NOW(), INTERVAL 11 MONTH), INTERVAL 1 HOUR), 0)`);
    await conn.end();

    // The twenty five still to come, and the one from eleven months ago.
    expect(await events.getPublicEventSitemapEntries()).toHaveLength(26);
  });
});
