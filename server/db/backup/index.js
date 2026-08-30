import { execFile } from 'node:child_process';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';

/**
 * Write a short lived client options file holding the credentials.
 *
 * The password never goes on a command line. Arguments are world readable
 * through ps and /proc on the host, and this code runs against production
 * during a cutover. The file is created inside a private temporary directory
 * and narrowed to the owner before the password is written into it.
 */
async function writeDefaultsFile(dir, config) {
  const path = join(dir, 'client.cnf');
  await writeFile(path, '', { mode: 0o600 });
  await chmod(path, 0o600);
  await writeFile(path, [
    '[client]',
    `host=${config.host}`,
    `port=${config.port}`,
    `user=${config.user}`,
    `password=${config.password}`,
    '',
  ].join('\n'), { mode: 0o600 });
  return path;
}

/** Row counts for every base table in the schema, used as the verification target. */
async function tableRowCounts(config) {
  const conn = await mysql.createConnection(config);
  const [tables] = await conn.query(
    "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
    [config.database]
  );
  const counts = {};
  for (const { t } of tables) {
    const [rows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    counts[t] = Number(rows[0].n);
  }
  await conn.end();
  return counts;
}

/**
 * Dump the database and hand the file to a destination.
 *
 * Row counts are taken from the live database before the dump so that
 * verification has something independent to compare against. COUNT(*) is used
 * rather than information_schema.table_rows because the latter is an estimate
 * for InnoDB and would make verification meaningless.
 */
export async function createBackup({ config, destination }) {
  const tables = await tableRowCounts(config);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${config.database}-${stamp}.sql`;
  const tmpDir = await mkdtemp(join(tmpdir(), 'via-dump-'));
  const tmpPath = join(tmpDir, name);
  const defaultsFile = await writeDefaultsFile(tmpDir, config);

  try {
    await new Promise((resolve, reject) => {
      const out = createWriteStream(tmpPath);
      const child = execFile('mysqldump', [
        `--defaults-file=${defaultsFile}`,
        '--single-transaction', '--routines', '--triggers', '--events',
        config.database,
      ], { maxBuffer: Infinity });

      let stderr = '';
      let exitCode = null;
      let written = false;

      // The dump is only complete once mysqldump has exited and the file
      // stream has flushed. Waiting on one of those alone truncates the dump
      // or reports success before the bytes are on disk.
      const settle = () => {
        if (exitCode === null || !written) return;
        if (exitCode === 0) resolve();
        else reject(new Error(`mysqldump exited ${exitCode}: ${stderr}`));
      };

      child.stderr.on('data', d => { stderr += d; });
      child.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => { written = true; settle(); });
      child.on('close', code => { exitCode = code; settle(); });
      child.stdout.pipe(out);
    });

    const path = await destination.store(tmpPath, name);
    return { path, tables };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Prove a dump is restorable by restoring it into a scratch database and
 * comparing every table's row count against the source.
 *
 * This throws rather than returning a boolean. A backup that cannot be
 * verified is a failed backup, and the caller should not be able to ignore
 * that by forgetting to check a return value.
 */
export async function verifyBackup({ path, expectedTables, config }) {
  const scratch = `via_verify_${Date.now()}`;
  const admin = { ...config, database: undefined, multipleStatements: true };
  const conn = await mysql.createConnection(admin);
  await conn.query(`CREATE DATABASE \`${scratch}\``);
  await conn.end();

  const tmpDir = await mkdtemp(join(tmpdir(), 'via-verify-'));
  try {
    const defaultsFile = await writeDefaultsFile(tmpDir, config);
    await new Promise((resolve, reject) => {
      const child = execFile('mysql', [`--defaults-file=${defaultsFile}`, scratch]);
      let stderr = '';
      child.stderr.on('data', d => { stderr += d; });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`restore exited ${code}: ${stderr}`));
      });
      createReadStream(path).pipe(child.stdin);
    });

    const restored = await tableRowCounts({ ...admin, database: scratch });
    for (const [table, expected] of Object.entries(expectedTables)) {
      if (restored[table] !== expected) {
        throw new Error(
          `row count mismatch for ${table}: expected ${expected}, restored ${restored[table] ?? 'missing table'}`
        );
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
    const cleanup = await mysql.createConnection(admin);
    await cleanup.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await cleanup.end();
  }
}
