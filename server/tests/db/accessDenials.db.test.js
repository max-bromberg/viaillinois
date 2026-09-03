import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let query;

/**
 * Denials are counted in memory and flushed as aggregates, because writing one
 * row per refusal would put the heaviest write load on the database at exactly
 * the moment the database is the thing under pressure. Two flushes inside the
 * same minute therefore have to add rather than collide.
 */
describe('Access_Denials', () => {
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
  }, 180_000);

  afterAll(async () => {
    const pool = (await import('../../db/pool.js')).default;
    await pool.end();
  });

  beforeEach(async () => { await query('DELETE FROM Access_Denials'); });

  const insert = (denialCount, clientCount) => query(
    `INSERT INTO Access_Denials
       (bucket_start, reason, route, authenticated, denial_count, client_count)
     VALUES ('2026-09-03 14:05:00', 'overloaded', '/api/v1/events', 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       denial_count = denial_count + VALUES(denial_count),
       client_count = GREATEST(client_count, VALUES(client_count))`,
    [denialCount, clientCount]
  );

  it('records a bucket', async () => {
    await insert(12, 3);
    const rows = await query('SELECT * FROM Access_Denials');
    expect(rows).toHaveLength(1);
    expect(rows[0].denial_count).toBe(12);
  });

  it('adds a second flush into the same minute rather than colliding', async () => {
    await insert(12, 3);
    await insert(7, 5);
    const rows = await query('SELECT * FROM Access_Denials');
    expect(rows).toHaveLength(1);
    expect(rows[0].denial_count).toBe(19);
    expect(rows[0].client_count).toBe(5);
  });

  it('keeps buckets apart when the reason differs', async () => {
    await insert(1, 1);
    await query(
      `INSERT INTO Access_Denials
         (bucket_start, reason, route, authenticated, denial_count, client_count)
       VALUES ('2026-09-03 14:05:00', 'row_budget', '/api/v1/events', 0, 4, 1)`
    );
    const rows = await query('SELECT * FROM Access_Denials');
    expect(rows).toHaveLength(2);
  });

  it('stores no address, in any column', async () => {
    const columns = await query('SHOW COLUMNS FROM Access_Denials');
    const names = columns.map(c => c.Field).join(' ');
    expect(names).not.toMatch(/ip|address|client_key|net_id/i);
  });
});
