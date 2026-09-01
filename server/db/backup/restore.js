import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { writeDefaultsFile } from './credentials.js';
import { feedDump } from './feed.js';

/**
 * Restore a dump over a database, replacing its current contents entirely.
 *
 * The database is dropped and recreated first. Restoring over a live schema
 * would leave behind any table the dump does not mention, which after a failed
 * migration is exactly the garbage we are trying to remove.
 */
export async function restoreBackup({ path, config }) {
  const admin = { ...config, database: undefined, multipleStatements: true };
  const conn = await mysql.createConnection(admin);
  await conn.query(`DROP DATABASE IF EXISTS \`${config.database}\``);
  await conn.query(`CREATE DATABASE \`${config.database}\``);
  await conn.end();

  const tmpDir = await mkdtemp(join(tmpdir(), 'via-restore-'));
  try {
    const defaultsFile = await writeDefaultsFile(tmpDir, config);
    await new Promise((resolve, reject) => {
      const child = execFile('mysql', [`--defaults-file=${defaultsFile}`, config.database]);
      let stderr = '';
      child.stderr.on('data', d => { stderr += d; });
      child.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`restore exited ${code}: ${stderr}`));
      });
      feedDump(child, path, reject);
    });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
