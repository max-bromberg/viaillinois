import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';
import { createBackup, verifyBackup } from '../../db/backup/index.js';
import { LocalDestination } from '../../db/backup/localDestination.js';
import { restoreBackup } from '../../db/backup/restore.js';

let dir;

describe('cutover rollback', () => {
  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
  }, 180_000);

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetTestDb();
    dir = await mkdtemp(join(tmpdir(), 'via-cutover-'));
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('CREATE TABLE Widgets (id INT PRIMARY KEY, label VARCHAR(50))');
    await conn.query("INSERT INTO Widgets VALUES (1, 'one'), (2, 'two')");
    await conn.end();
  });

  it('restores the pre-migration state after a destructive failed migration', async () => {
    const backup = await createBackup({
      config: testDbConfig,
      destination: new LocalDestination(dir, 10),
    });
    await verifyBackup({ path: backup.path, expectedTables: backup.tables, config: testDbConfig });

    // Simulate a migration that gets partway and then destroys data.
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('DELETE FROM Widgets WHERE id = 2');
    await conn.query('ALTER TABLE Widgets ADD COLUMN broken INT');
    await conn.end();

    await restoreBackup({ path: backup.path, config: testDbConfig });

    const check = await mysql.createConnection(testDbConfig);
    const [rows] = await check.query('SELECT COUNT(*) AS n FROM Widgets');
    const [cols] = await check.query(
      'SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?',
      [testDbConfig.database, 'Widgets']
    );
    await check.end();

    expect(rows[0].n).toBe(2);
    expect(cols.map(c => c.c)).not.toContain('broken');
  });

  it('removes a table the failed migration created and the dump does not mention', async () => {
    const backup = await createBackup({
      config: testDbConfig,
      destination: new LocalDestination(dir, 10),
    });

    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('CREATE TABLE HalfMigrated (id INT PRIMARY KEY)');
    await conn.end();

    await restoreBackup({ path: backup.path, config: testDbConfig });

    const check = await mysql.createConnection(testDbConfig);
    const [tables] = await check.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
      [testDbConfig.database]
    );
    await check.end();
    expect(tables.map(r => r.t)).not.toContain('HalfMigrated');
  });
});
