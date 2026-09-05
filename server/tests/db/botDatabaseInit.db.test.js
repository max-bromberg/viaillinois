import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import { startTestDb, testDbConfig } from '../support/testDb.js';

const SCRIPT = join(import.meta.dirname, '..', '..', 'db', 'init', '01-bot-database.sh');

/**
 * The values docker-compose.test.yml passes the script in the gate, so that
 * what this test executes is what the throwaway database has already run.
 */
const VALUES = {
  BOT_DB_NAME: 'via_bot',
  BOT_DB_USER: 'via_bot',
  BOT_DB_PASSWORD: 'test_bot_pw',
};

/**
 * The statements the script sends, with the shell's expansion done the way the
 * shell would do it. Reading them out of the script rather than repeating them
 * here is the point: a change to the script is a change to what this test
 * proves, and a script that stops creating the account fails here.
 */
function statementsFromScript() {
  const text = readFileSync(SCRIPT, 'utf8');
  const body = text.match(/<<EOSQL\n([\s\S]*?)\nEOSQL/);
  if (!body) throw new Error('the initialisation script has no EOSQL block to read');
  // The heredoc is unquoted, so the shell expands the variables and unescapes
  // the backslashes in front of the identifier quotes. Both are done here.
  const sql = body[1].replace(/\\`/g, '`').replace(/\$\{(\w+)\}/g, (whole, name) => {
    if (!(name in VALUES)) throw new Error(`the script reads ${name}, which this test does not set`);
    return VALUES[name];
  });
  if (sql.includes('${')) throw new Error('a variable in the script was left unexpanded');
  return sql;
}

/**
 * What this proves, and what it does not.
 *
 * MySQL runs the initialisation directory only once, on an empty data
 * directory, and only through the database image's entrypoint. Neither of
 * those can happen inside a test. So this test takes the statements out of the
 * script and runs them itself, as root, against the throwaway database, and
 * then checks what they built: the bot's database exists, the bot's account
 * can work inside it, and that account can reach nothing else on the server.
 * A syntax error or a grant that is too wide fails here.
 *
 * What runs the script for real is the gate's database job, where the same
 * file is mounted into the throwaway container and a broken script stops the
 * container from starting at all.
 */
describe('the bot database initialisation script', () => {
  let root;

  beforeAll(async () => {
    await startTestDb();
    root = await mysql.createConnection({
      ...testDbConfig,
      database: undefined,
      multipleStatements: true,
    });
    await root.query(`DROP DATABASE IF EXISTS ${VALUES.BOT_DB_NAME}`);
    await root.query(`DROP USER IF EXISTS '${VALUES.BOT_DB_USER}'@'%'`);
    await root.query(statementsFromScript());
  }, 180_000);

  afterAll(async () => {
    if (!root) return;
    await root.query(`DROP DATABASE IF EXISTS ${VALUES.BOT_DB_NAME}`);
    await root.query(`DROP USER IF EXISTS '${VALUES.BOT_DB_USER}'@'%'`);
    await root.end();
  });

  async function asBot(database) {
    return mysql.createConnection({
      host: testDbConfig.host,
      port: testDbConfig.port,
      user: VALUES.BOT_DB_USER,
      password: VALUES.BOT_DB_PASSWORD,
      database,
    });
  }

  it('creates the database the bot migrates', async () => {
    const [rows] = await root.query('SHOW DATABASES LIKE ?', [VALUES.BOT_DB_NAME]);
    expect(rows).toHaveLength(1);
  });

  it('creates no table, because every table comes from a migration', async () => {
    const [rows] = await root.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?',
      [VALUES.BOT_DB_NAME],
    );
    expect(rows).toEqual([]);
  });

  it('lets the bot account change the schema of its own database', async () => {
    // The bot's migrate script runs as this account, so a grant that only
    // allowed reading and writing rows would fail on the first migration.
    const bot = await asBot(VALUES.BOT_DB_NAME);
    await bot.query('CREATE TABLE Probe (id INT PRIMARY KEY)');
    await bot.query('INSERT INTO Probe VALUES (1)');
    await bot.query('DROP TABLE Probe');
    await bot.end();
  });

  it('does not let the bot account reach the web platform database', async () => {
    // This is the boundary the whole design rests on. Everything the bot knows
    // about events, memberships and people comes through the internal service
    // API, and an account that could read the web platform's tables directly
    // would be a way around every authorization decision that API makes.
    const bot = await asBot(undefined);
    await expect(bot.query(`USE ${testDbConfig.database}`)).rejects.toThrow(/denied/i);
    const [databases] = await bot.query('SHOW DATABASES');
    const names = databases.map((row) => Object.values(row)[0]);
    expect(names).toContain(VALUES.BOT_DB_NAME);
    expect(names).not.toContain(testDbConfig.database);
    await bot.end();
  });

  it('does not let the bot account create a database of its own', async () => {
    const bot = await asBot(VALUES.BOT_DB_NAME);
    await expect(bot.query('CREATE DATABASE via_bot_elsewhere')).rejects.toThrow(/denied/i);
    await bot.end();
  });
});
