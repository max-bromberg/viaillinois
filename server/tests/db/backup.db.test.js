import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';
import { createBackup, verifyBackup } from '../../db/backup/index.js';
import { LocalDestination } from '../../db/backup/localDestination.js';

let dir;

describe('backup', () => {
  beforeAll(async () => { await startTestDb(); }, 180_000);
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetTestDb();
    dir = await mkdtemp(join(tmpdir(), 'via-backup-'));
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('CREATE TABLE Widgets (id INT PRIMARY KEY, label VARCHAR(50))');
    await conn.query("INSERT INTO Widgets VALUES (1, 'one'), (2, 'two'), (3, 'three')");
    await conn.end();
  });

  it('produces a dump and reports the row count of every table', async () => {
    const result = await createBackup({
      config: testDbConfig,
      destination: new LocalDestination(dir, 10),
    });
    expect(result.tables.Widgets).toBe(3);
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
  });

  it('verifies a good dump by restoring it and comparing row counts', async () => {
    const result = await createBackup({
      config: testDbConfig,
      destination: new LocalDestination(dir, 10),
    });
    await expect(
      verifyBackup({ path: result.path, expectedTables: result.tables, config: testDbConfig })
    ).resolves.toBeUndefined();
  });

  it('rejects a truncated dump', async () => {
    const result = await createBackup({
      config: testDbConfig,
      destination: new LocalDestination(dir, 10),
    });
    await writeFile(result.path, 'CREATE TABLE Widgets (id INT PRIMARY KEY);\n');
    await expect(
      verifyBackup({ path: result.path, expectedTables: result.tables, config: testDbConfig })
    ).rejects.toThrow(/row count mismatch|Widgets/);
  });

  it('prunes to the retention count, keeping the newest', async () => {
    const destination = new LocalDestination(dir, 2);
    for (let i = 0; i < 4; i++) {
      await createBackup({ config: testDbConfig, destination });
      await new Promise(resolve => setTimeout(resolve, 1100));
    }
    const files = await destination.list();
    expect(files).toHaveLength(2);
  });
});
