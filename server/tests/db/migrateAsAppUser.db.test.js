import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

const APP_USER = 'via_app';
const APP_PASSWORD = 'app_pw';

/**
 * Production runs the application as DB_USER, an account scoped to its own
 * database, and MySQL refuses to create a trigger from such an account while
 * binary logging is on. Tests that connect as root never see that, which is
 * how it reached a cutover rehearsal undetected. Migrations therefore run on
 * the administrative account, and this reproduces the split.
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

describe('migrating as the application user', () => {
  let applyMigrations;

  beforeAll(async () => {
    await startTestDb();
    ({ applyMigrations } = await import('../../db/migrate.ts'));
  }, 180_000);

  beforeEach(async () => {
    await resetTestDb();
    const conn = await mysql.createConnection({ ...testDbConfig, database: undefined });
    await conn.query(`CREATE USER IF NOT EXISTS '${APP_USER}'@'%' IDENTIFIED BY '${APP_PASSWORD}'`);
    await conn.query(`GRANT ALL PRIVILEGES ON \`${testDbConfig.database}\`.* TO '${APP_USER}'@'%'`);
    await conn.query('FLUSH PRIVILEGES');
    await conn.end();

    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_NAME = testDbConfig.database;
    process.env.DB_USER = APP_USER;
    process.env.DB_PASSWORD = APP_PASSWORD;
    process.env.DB_ADMIN_USER = testDbConfig.user;
    process.env.DB_ADMIN_PASSWORD = testDbConfig.password;
  });

  afterEach(() => {
    delete process.env.DB_ADMIN_USER;
    delete process.env.DB_ADMIN_PASSWORD;
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
  });

  /**
   * MySQL refuses to create a stored program from an account without SUPER
   * while binary logging is on, which the application account does not have.
   * The migration runner therefore uses an administrative connection, and this
   * proves it: the procedure exists after migrating as the application user.
   */
  it('creates a stored program even though the application account may not', async () => {
    const result = await applyMigrations();
    expect(result.applied).toBe(migrationCount());

    const conn = await mysql.createConnection(testDbConfig);
    const [routines] = await conn.query(
      "SELECT routine_name AS n FROM information_schema.routines WHERE routine_schema = ? AND routine_type = 'PROCEDURE'",
      [testDbConfig.database]
    );
    await conn.end();
    expect(routines.map(r => r.n)).toContain('GetRSOStats');
  });

  it('releases the migration lock, so a later deploy is not blocked by the last one', async () => {
    await applyMigrations();
    const conn = await mysql.createConnection(testDbConfig);
    const [rows] = await conn.query("SELECT IS_FREE_LOCK('via_migrations') AS free");
    await conn.end();
    expect(Number(rows[0].free)).toBe(1);
  });
});
