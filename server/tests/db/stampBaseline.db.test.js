import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let stampBaseline, applyMigrations;

const productionSchema = () =>
  readFileSync(new URL('../fixtures/verified-production-schema.sql', import.meta.url), 'utf8')
    .replace(/^CREATE DATABASE[^;]*;/m, '')
    .replace(/^USE [^;]*;/m, '');

async function tables(conn) {
  const [rows] = await conn.query(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
    [testDbConfig.database]
  );
  return rows.map(r => r.t);
}

/**
 * Production already carries the schema the baseline creates, and it has no
 * migration bookkeeping, because it predates the migration system. Applying
 * the baseline there would fail on the first CREATE TABLE and take a deploy
 * down with it. Stamping records the baseline as applied without running it.
 */
/**
 * How many migrations the journal declares. Reading it here keeps these
 * assertions about stamping and privileges rather than about how many
 * migrations happen to exist, which changes with every schema change.
 */
function migrationCount() {
  const journal = JSON.parse(
    readFileSync(new URL('../../db/migrations/meta/_journal.json', import.meta.url), 'utf8')
  );
  return journal.entries.length;
}

describe('baseline stamping', () => {
  beforeAll(async () => {
    await startTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    ({ stampBaseline, applyMigrations } = await import('../../db/migrate.ts'));
  }, 180_000);

  beforeEach(async () => { await resetTestDb(); });

  it('stamps a database that already carries the baseline schema, then migrates forward', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(productionSchema());
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('keeper', 'Keeper', 'keeper@illinois.edu')");

    const stamped = await stampBaseline();
    expect(stamped).toBe(true);

    // Everything except the baseline, which was stamped rather than run.
    const result = await applyMigrations();
    expect(result.applied).toBe(migrationCount() - 1);

    const [rows] = await conn.query('SELECT COUNT(*) AS n FROM Users');
    expect(Number(rows[0].n)).toBe(1);
    const [routines] = await conn.query(
      "SELECT routine_name AS n FROM information_schema.routines WHERE routine_schema = ?",
      [testDbConfig.database]
    );
    await conn.end();
    expect(routines.map(r => r.n)).toContain('GetRSOStats');
  });

  it('does nothing on an empty database, so the baseline still runs there', async () => {
    expect(await stampBaseline()).toBe(false);
    const result = await applyMigrations();
    expect(result.applied).toBe(migrationCount());
    const conn = await mysql.createConnection(testDbConfig);
    expect(await tables(conn)).toContain('Users');
    await conn.end();
  });

  it('does nothing when the database is already stamped', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(productionSchema());
    await conn.end();
    expect(await stampBaseline()).toBe(true);
    expect(await stampBaseline()).toBe(false);
  });

  it('refuses to stamp a database whose tables are not the baseline', async () => {
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query('CREATE TABLE Surprise (id INT PRIMARY KEY)');
    await conn.end();
    await expect(stampBaseline()).rejects.toThrow(/does not match the baseline/);
  });
});
