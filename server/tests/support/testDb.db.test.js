import { describe, it, expect, beforeAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, testDbConfig } from './testDb.js';

describe('test database harness', () => {
  beforeAll(async () => { await startTestDb(); }, 120_000);

  it('accepts connections on the throwaway port', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    const [rows] = await conn.query('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
    await conn.end();
  });

  it('is not the development database', () => {
    expect(testDbConfig.port).toBe(3307);
    expect(testDbConfig.database).toBe('via_test');
  });
});
