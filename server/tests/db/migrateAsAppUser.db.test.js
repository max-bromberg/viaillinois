import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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

  it('creates the trigger even though the application account may not', async () => {
    const result = await applyMigrations();
    expect(result.applied).toBe(2);

    const conn = await mysql.createConnection(testDbConfig);
    const [triggers] = await conn.query(
      'SELECT trigger_name AS n FROM information_schema.triggers WHERE trigger_schema = ?',
      [testDbConfig.database]
    );
    await conn.end();
    expect(triggers.map(r => r.n)).toContain('trg_auto_confirm_midterm');
  });

  it('releases the migration lock, so a later deploy is not blocked by the last one', async () => {
    await applyMigrations();
    const conn = await mysql.createConnection(testDbConfig);
    const [rows] = await conn.query("SELECT IS_FREE_LOCK('via_migrations') AS free");
    await conn.end();
    expect(Number(rows[0].free)).toBe(1);
  });
});
