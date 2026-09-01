import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let conn;

describe('advanced database objects', () => {
  beforeAll(async () => {
    await startTestDb();
    await resetTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    const { applyMigrations } = await import('../../db/migrate.ts');
    await applyMigrations();
    conn = await mysql.createConnection(testDbConfig);
  }, 180_000);

  afterAll(async () => {
    if (conn) await conn.end();
  });

  it('creates the GetRSOStats procedure', async () => {
    const [rows] = await conn.query(
      "SELECT routine_name AS n FROM information_schema.routines WHERE routine_schema = ? AND routine_type = 'PROCEDURE'",
      [testDbConfig.database]
    );
    expect(rows.map(r => r.n)).toContain('GetRSOStats');
  });

  it('GetRSOStats is callable and returns two result sets', async () => {
    const [results] = await conn.query('CALL GetRSOStats(?)', [1]);
    expect(Array.isArray(results[0])).toBe(true);
    expect(Array.isArray(results[1])).toBe(true);
  });
});
