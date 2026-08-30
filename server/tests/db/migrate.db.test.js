import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let applyMigrations, currentVersion;

describe('migration runner', () => {
  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    ({ applyMigrations, currentVersion } = await import('../../db/migrate.ts'));
  }, 180_000);

  beforeEach(async () => { await resetTestDb(); });

  it('reports no version on a database with no migrations applied', async () => {
    expect(await currentVersion()).toBe(null);
  });

  it('applies every pending migration and reports a version', async () => {
    const result = await applyMigrations();
    expect(result.applied).toBeGreaterThan(0);
    expect(result.version).toEqual(expect.any(String));
    expect(await currentVersion()).toBe(result.version);
  });

  it('is idempotent: a second run applies nothing and keeps the version', async () => {
    const first = await applyMigrations();
    const second = await applyMigrations();
    expect(second.applied).toBe(0);
    expect(second.version).toBe(first.version);
  });

  it('creates every expected table', async () => {
    await applyMigrations();
    const conn = await mysql.createConnection(testDbConfig);
    const [rows] = await conn.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
      [testDbConfig.database]
    );
    await conn.end();
    const tables = rows.map(r => r.t);
    expect(tables).toEqual(expect.arrayContaining(['Users', 'RSOs', 'Events', 'RSVPs']));
  });

  it('refuses to run while another migration holds the lock', async () => {
    const holder = await mysql.createConnection(testDbConfig);
    await holder.query("SELECT GET_LOCK('via_migrations', 0)");
    await expect(applyMigrations()).rejects.toThrow('another migration is in progress');
    await holder.query("SELECT RELEASE_LOCK('via_migrations')");
    await holder.end();
  });
});
