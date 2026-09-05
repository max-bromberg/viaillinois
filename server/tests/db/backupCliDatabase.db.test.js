import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { startTestDb, testDbConfig } from '../support/testDb.js';

const run = promisify(execFile);
const SERVER = join(import.meta.dirname, '..', '..');
const OTHER = 'via_bot_probe';

/**
 * The cutover backs up two databases, the web platform's and the Discord
 * bot's, by running these two command line scripts twice each. This proves the
 * second run works on the database it is told to work on rather than on the
 * one the environment names, which is the whole of what makes one script serve
 * both.
 */
describe('the backup and restore scripts on a named database', () => {
  let dir;
  const env = {
    ...process.env,
    DB_HOST: testDbConfig.host,
    DB_PORT: String(testDbConfig.port),
    DB_ADMIN_USER: testDbConfig.user,
    DB_ADMIN_PASSWORD: testDbConfig.password,
    // The environment names the web platform's database throughout, so a
    // script that ignored the argument would back that one up instead.
    DB_NAME: testDbConfig.database,
  };

  beforeAll(async () => {
    await startTestDb();
    dir = await mkdtemp(join(tmpdir(), 'via-bot-backup-'));
    const conn = await mysql.createConnection({ ...testDbConfig, database: undefined });
    await conn.query(`DROP DATABASE IF EXISTS ${OTHER}`);
    await conn.query(`CREATE DATABASE ${OTHER}`);
    await conn.query(`CREATE TABLE ${OTHER}.Deliveries (id INT PRIMARY KEY)`);
    await conn.query(`INSERT INTO ${OTHER}.Deliveries VALUES (1), (2)`);
    await conn.end();
  }, 180_000);

  afterAll(async () => {
    const conn = await mysql.createConnection({ ...testDbConfig, database: undefined });
    await conn.query(`DROP DATABASE IF EXISTS ${OTHER}`);
    await conn.end();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('dumps and verifies the database named on the command line', async () => {
    const { stdout } = await run(
      'node',
      ['db/backup/backupCli.js', '--dir', dir, '--retention', '10', '--database', OTHER],
      { cwd: SERVER, env },
    );
    expect(stdout.trim()).toContain(`${OTHER}-`);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('restores that database and leaves the other one alone', async () => {
    const { stdout } = await run(
      'node',
      ['db/backup/backupCli.js', '--dir', dir, '--retention', '10', '--database', OTHER],
      { cwd: SERVER, env },
    );
    const path = stdout.trim();

    const conn = await mysql.createConnection({ ...testDbConfig, database: undefined });
    await conn.query(`DELETE FROM ${OTHER}.Deliveries`);
    await conn.end();

    await run('node', ['db/backup/restoreCli.js', path, '--database', OTHER], {
      cwd: SERVER,
      env,
    });

    const after = await mysql.createConnection({ ...testDbConfig, database: undefined });
    const [rows] = await after.query(`SELECT COUNT(*) AS n FROM ${OTHER}.Deliveries`);
    await after.end();
    expect(Number(rows[0].n)).toBe(2);
  });
});
