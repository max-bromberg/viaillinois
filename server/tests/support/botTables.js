import { startTestDb, resetTestDb, testDbConfig } from './testDb.js';

/**
 * Bring up an empty database with every migration applied and hand back the
 * raw query function, for suites that test what the schema itself guarantees.
 * Each suite calls this once and then deletes what it inserted between tests.
 */
export async function migratedDb() {
  await startTestDb();
  process.env.DB_HOST = testDbConfig.host;
  process.env.DB_PORT = String(testDbConfig.port);
  process.env.DB_USER = testDbConfig.user;
  process.env.DB_PASSWORD = testDbConfig.password;
  process.env.DB_NAME = testDbConfig.database;
  await resetTestDb();
  const { applyMigrations } = await import('../../db/migrate.ts');
  await applyMigrations();
  const pool = (await import('../../db/pool.js'));
  return { query: pool.query, end: () => pool.default.end() };
}

/** One user, one RSO and one event to hang rows off. Returns their identifiers. */
export async function seedEventFixture(query) {
  await query("INSERT INTO Users (net_id, full_name, email) VALUES ('alice', 'Alice', 'alice@illinois.edu')");
  await query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
  await query(
    `INSERT INTO Events (event_id, rso_id, created_by, title, start_time, end_time)
     VALUES (10, 1, 'alice', 'General meeting', '2026-09-10 18:00:00', '2026-09-10 19:00:00')`
  );
  return { netId: 'alice', rsoId: 1, eventId: 10 };
}
