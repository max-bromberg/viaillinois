import { migrate } from 'drizzle-orm/mysql2/migrator';
import { sql } from 'drizzle-orm';
import db from './client.ts';

const LOCK_NAME = 'via_migrations';
const MIGRATIONS_FOLDER = new URL('./migrations', import.meta.url).pathname;

/**
 * Read the most recently applied migration hash.
 * Returns null when the migrations table does not exist yet, which is the
 * state of a database that has never been migrated.
 */
export async function currentVersion(): Promise<string | null> {
  try {
    const rows = await db.execute(sql`
      SELECT hash FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1
    `);
    const first = (rows as unknown as any[])[0]?.[0] ?? (rows as unknown as any[])[0];
    return first?.hash ?? null;
  } catch {
    return null;
  }
}

async function countApplied(): Promise<number> {
  try {
    const rows = await db.execute(sql`SELECT COUNT(*) AS n FROM __drizzle_migrations`);
    const first = (rows as unknown as any[])[0]?.[0] ?? (rows as unknown as any[])[0];
    return Number(first?.n ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Apply all pending migrations under a MySQL named lock.
 *
 * The lock is what prevents two concurrent deploys from migrating at the same
 * time. GET_LOCK with a zero timeout fails immediately rather than queueing,
 * because a deploy that waits behind another deploy is a deploy that should
 * stop and let a human look at it.
 */
export async function applyMigrations(): Promise<{ applied: number; version: string }> {
  const acquired = await db.execute(sql`SELECT GET_LOCK(${LOCK_NAME}, 0) AS got`);
  const lockRow = (acquired as unknown as any[])[0]?.[0] ?? (acquired as unknown as any[])[0];
  if (Number(lockRow?.got) !== 1) {
    throw new Error('another migration is in progress');
  }

  try {
    const before = await countApplied();
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const after = await countApplied();
    const version = await currentVersion();
    if (version === null) {
      throw new Error('migrations applied but no version was recorded');
    }
    return { applied: after - before, version };
  } finally {
    await db.execute(sql`SELECT RELEASE_LOCK(${LOCK_NAME})`);
  }
}

// Allow running as a script: `node --experimental-strip-types db/migrate.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  applyMigrations()
    .then(({ applied, version }) => {
      console.log(`migrations applied: ${applied}, version: ${version}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`migration failed: ${err.message}`);
      process.exit(1);
    });
}
