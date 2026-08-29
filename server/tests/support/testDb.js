import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';

const run = promisify(execFile);
const COMPOSE_FILE = new URL('../../../docker-compose.test.yml', import.meta.url).pathname;

export const testDbConfig = {
  host:     '127.0.0.1',
  port:     3307,
  user:     'root',
  password: 'test_root_pw',
  database: 'via_test',
  multipleStatements: true,
};

/**
 * Bring up the throwaway MySQL container and wait until it accepts queries.
 * Waiting on the container healthcheck is not enough: MySQL reports healthy
 * shortly before it finishes its first-boot initialization, so we poll with a
 * real connection instead.
 */
export async function startTestDb() {
  await run('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d', 'test-db']);
  const deadline = Date.now() + 120_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const conn = await mysql.createConnection(testDbConfig);
      await conn.query('SELECT 1');
      await conn.end();
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`test database did not become ready: ${lastError?.message}`);
}

export async function stopTestDb() {
  await run('docker', ['compose', '-f', COMPOSE_FILE, 'down', '-v']);
}

/** Drop and recreate the schema so each suite starts from a known empty state. */
export async function resetTestDb() {
  const conn = await mysql.createConnection({ ...testDbConfig, database: undefined });
  await conn.query('DROP DATABASE IF EXISTS via_test');
  await conn.query('CREATE DATABASE via_test');
  await conn.end();
}
