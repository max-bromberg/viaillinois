import { migrate } from 'drizzle-orm/mysql2/migrator';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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


/** Table names the baseline migration creates. */
function baselineTables(): string[] {
  const baseline = readFileSync(join(MIGRATIONS_FOLDER, '0000_baseline.sql'), 'utf8');
  return [...baseline.matchAll(/CREATE TABLE `([A-Za-z_]+)`/g)].map(m => m[1]).sort();
}

async function currentTables(): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT table_name AS t FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
       AND table_name <> '__drizzle_migrations'
  `);
  const list = ((rows as unknown as any[])[0] ?? []) as Array<{ t: string }>;
  return list.map(r => r.t).sort();
}

/**
 * Record the baseline as applied without executing it.
 *
 * Production carries the baseline schema already, because it predates the
 * migration system, and it has no bookkeeping table. Running the baseline
 * there would fail on the first CREATE TABLE and take the deploy down. This
 * writes the row the migrator would have written, so that later migrations
 * apply normally.
 *
 * It stamps only a database whose tables are exactly the baseline's. An empty
 * database is left alone, since the baseline should genuinely run there, and
 * anything else is refused rather than guessed at.
 *
 * @returns true when it stamped, false when there was nothing to do.
 */
export async function stampBaseline(): Promise<boolean> {
  if (await currentVersion() !== null) return false;

  const present = await currentTables();
  if (present.length === 0) return false;

  const expected = baselineTables();
  if (present.join(',') !== expected.join(',')) {
    throw new Error(
      `refusing to stamp: the database does not match the baseline. ` +
      `Expected ${expected.length} tables (${expected.join(', ')}) ` +
      `but found ${present.length} (${present.join(', ')}).`
    );
  }

  const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8'));
  const entry = journal.entries.find((e: any) => e.tag === '0000_baseline');
  if (!entry) throw new Error('no 0000_baseline entry in the migration journal');

  // The migrator hashes the whole file and treats a migration as applied when
  // its journal timestamp is not newer than the newest recorded one, so both
  // values have to match what it would have written itself.
  const hash = createHash('sha256')
    .update(readFileSync(join(MIGRATIONS_FOLDER, '0000_baseline.sql')))
    .digest('hex');

  await db.execute(sql`
    create table if not exists \`__drizzle_migrations\` (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `);
  await db.execute(sql`
    insert into \`__drizzle_migrations\` (\`hash\`, \`created_at\`) values (${hash}, ${entry.when})
  `);
  return true;
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
  stampBaseline()
    .then((stamped) => {
      if (stamped) console.log('baseline stamped: the database already carried it');
      return applyMigrations();
    })
    .then(({ applied, version }) => {
      console.log(`migrations applied: ${applied}, version: ${version}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(`migration failed: ${err.message}`);
      process.exit(1);
    });
}
