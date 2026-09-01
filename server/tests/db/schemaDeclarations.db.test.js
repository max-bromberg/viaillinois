import { describe, it, expect, beforeAll } from 'vitest';
import mysql from 'mysql2/promise';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

/**
 * The generated schema declarations have to describe every column that exists
 * in the database. drizzle-kit compares these declarations against the stored
 * snapshot, so a column that is missing here is a column that a future
 * generate would emit a DROP for.
 *
 * The database to compare against is the one the migrations build, not the
 * frozen production snapshot. The snapshot is the state before any migration
 * ran, so comparing declarations to it would fail on the first migration that
 * added or removed a column, which is what migrations are for.
 */
describe('generated schema declarations', () => {
  let dbColumns;
  let declared;

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

    const conn = await mysql.createConnection(testDbConfig);
    const [rows] = await conn.query(
      `SELECT table_name AS t, column_name AS c FROM information_schema.columns
       WHERE table_schema = ? AND table_name <> '__drizzle_migrations'`,
      [testDbConfig.database]
    );
    await conn.end();

    dbColumns = new Map();
    for (const { t, c } of rows) {
      if (!dbColumns.has(t)) dbColumns.set(t, new Set());
      dbColumns.get(t).add(c);
    }

    const schema = await import('../../db/schema/schema.ts');
    declared = new Map();
    for (const value of Object.values(schema)) {
      if (!is(value, MySqlTable)) continue;
      declared.set(getTableName(value), new Set(
        Object.values(getTableColumns(value)).map(col => col.name)
      ));
    }
  }, 180_000);


  it('declares every table in the database', () => {
    expect([...declared.keys()].sort()).toEqual([...dbColumns.keys()].sort());
  });

  it('declares every column of every table, including the set column', () => {
    const missing = [];
    for (const [table, columns] of dbColumns) {
      for (const column of columns) {
        if (!declared.get(table)?.has(column)) missing.push(`${table}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
