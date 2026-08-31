import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { MySqlTable } from 'drizzle-orm/mysql-core';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

/**
 * The generated schema declarations have to describe every column that exists
 * in the database. drizzle-kit compares these declarations against the stored
 * snapshot, so a column that is missing here is a column that a future
 * generate would emit a DROP for.
 */
describe('generated schema declarations', () => {
  let dbColumns;
  let declared;

  beforeAll(async () => {
    await startTestDb();
    await resetTestDb();

    const schemaSql = readFileSync(new URL('../fixtures/verified-production-schema.sql', import.meta.url), 'utf8')
      .replace(/^CREATE DATABASE[^;]*;/m, '')
      .replace(/^USE [^;]*;/m, '');
    const conn = await mysql.createConnection(testDbConfig);
    await conn.query(schemaSql);
    const [rows] = await conn.query(
      `SELECT table_name AS t, column_name AS c FROM information_schema.columns
       WHERE table_schema = ?`,
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
