import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(import.meta.dirname, '..', '..', 'db', 'init', '01-bot-database.sh');

/**
 * Run the initialisation script with a stand in for the database client, so
 * that what it would have sent can be read without a database being there.
 *
 * @param {Record<string, string>} values the three settings the script reads
 */
function run(values) {
  const directory = mkdtempSync(join(tmpdir(), 'via-bot-init-'));
  const sent = join(directory, 'statements.sql');
  const client = join(directory, 'mysql');
  writeFileSync(client, `#!/bin/sh\ncat > "${sent}"\n`);
  chmodSync(client, 0o755);

  const result = spawnSync('sh', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${directory}:${process.env.PATH}`,
      MYSQL_ROOT_PASSWORD: 'a-root-password',
      ...values,
    },
  });
  return {
    said: `${result.stdout}${result.stderr}`,
    statements: existsSync(sent) ? readFileSync(sent, 'utf8') : null,
  };
}

const ORDINARY = { BOT_DB_USER: 'via_bot', BOT_DB_PASSWORD: 'a-long-random-value', BOT_DB_NAME: 'via_bot' };

/**
 * The three settings are pasted into SQL, inside quotes and inside identifier
 * backticks. A value carrying a quote, a backtick or a backslash would end the
 * quoting early and have the rest of itself read as SQL, by an account that is
 * root on the database server. The script refuses such a value rather than
 * trying to escape it.
 */
describe('the bot database initialisation script, on the values it is given', () => {
  it('sends the statements when the values are ordinary', () => {
    const { statements } = run(ORDINARY);
    expect(statements).toContain('CREATE DATABASE IF NOT EXISTS');
    expect(statements).toContain("CREATE USER IF NOT EXISTS 'via_bot'@'%'");
  });

  it('creates nothing and says why when a value carries a single quote', () => {
    const { said, statements } = run({ ...ORDINARY, BOT_DB_PASSWORD: "pw'; DROP DATABASE via; --" });
    expect(statements).toBeNull();
    expect(said).toMatch(/single quote/i);
  });

  it('creates nothing when a value carries a backtick', () => {
    const { said, statements } = run({ ...ORDINARY, BOT_DB_NAME: 'via_bot`' });
    expect(statements).toBeNull();
    expect(said).toMatch(/backtick/i);
  });

  it('creates nothing when a value carries a backslash', () => {
    const { said, statements } = run({ ...ORDINARY, BOT_DB_USER: 'via\\bot' });
    expect(statements).toBeNull();
    expect(said).toMatch(/backslash/i);
  });

  it('creates nothing when a value is missing, and says so', () => {
    const { said, statements } = run({ ...ORDINARY, BOT_DB_PASSWORD: '' });
    expect(statements).toBeNull();
    expect(said).toMatch(/creating nothing/i);
  });
});
