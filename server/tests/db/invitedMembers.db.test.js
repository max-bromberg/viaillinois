import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { startTestDb, resetTestDb, testDbConfig } from '../support/testDb.js';

let conn;

/**
 * An RSO board should be able to build its roster from a list of NetIDs
 * without waiting for every person to sign in first. A membership is a
 * foreign key to Users, so the person has to exist as a row; what changes is
 * that a row can now stand for someone VIA has never met.
 *
 * Such a row has no name and no email, because inventing either would put made
 * up data in front of the RSO board. It carries the moment it was invited
 * instead, which is what tells an unmet person from a signed in one.
 */
describe('invited members', () => {

  /**
   * The shared connection pool has to be closed when this suite is done.
   * Database suites run one after another in one process, and a later suite
   * that drops and recreates the database leaves any connection still open
   * here pointing at something that no longer exists, which then fails a
   * completely unrelated test.
   */
  afterAll(async () => {
    const pool = (await import('../../db/pool.js')).default;
    await pool.end();
  });
  beforeAll(async () => {
    await startTestDb();
    await resetTestDb();
    process.env.DB_HOST = testDbConfig.host;
    process.env.DB_PORT = String(testDbConfig.port);
    process.env.DB_USER = testDbConfig.user;
    process.env.DB_PASSWORD = testDbConfig.password;
    process.env.DB_NAME = testDbConfig.database;
    const { applyMigrations } = await import('../../db/migrate.ts');
    await applyMigrations();
    conn = await mysql.createConnection(testDbConfig);
  }, 180_000);

  beforeEach(async () => {
    await conn.query('DELETE FROM RSO_Memberships');
    await conn.query('DELETE FROM Users');
    await conn.query('DELETE FROM RSOs');
    await conn.query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
  });

  it('accepts a user with no name and no email', async () => {
    await conn.query("INSERT INTO Users (net_id, invited_at) VALUES ('newbie', NOW())");
    const [rows] = await conn.query("SELECT full_name, email, invited_at FROM Users WHERE net_id = 'newbie'");
    expect(rows[0].full_name).toBeNull();
    expect(rows[0].email).toBeNull();
    expect(rows[0].invited_at).not.toBeNull();
  });

  it('lets several invited people coexist without an email each', async () => {
    await conn.query("INSERT INTO Users (net_id, invited_at) VALUES ('one', NOW()), ('two', NOW())");
    const [rows] = await conn.query('SELECT COUNT(*) AS n FROM Users');
    expect(Number(rows[0].n)).toBe(2);
  });

  it('still refuses two accounts sharing an email', async () => {
    await conn.query("INSERT INTO Users (net_id, full_name, email) VALUES ('a', 'A', 'same@illinois.edu')");
    await expect(conn.query(
      "INSERT INTO Users (net_id, full_name, email) VALUES ('b', 'B', 'same@illinois.edu')"
    )).rejects.toThrow();
  });

  it('carries a membership for someone who has never signed in', async () => {
    await conn.query("INSERT INTO Users (net_id, invited_at) VALUES ('newbie', NOW())");
    await conn.query("INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES ('newbie', 1, 'Board')");
    const [rows] = await conn.query("SELECT role FROM RSO_Memberships WHERE net_id = 'newbie'");
    expect(rows[0].role).toBe('Board');
  });

  it('keeps the membership when that person finally signs in', async () => {
    await conn.query("INSERT INTO Users (net_id, invited_at) VALUES ('newbie', NOW())");
    await conn.query("INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES ('newbie', 1, 'Board')");

    const { upsertUser } = await import('../../db/queries/users.js');
    await upsertUser({ net_id: 'newbie', full_name: 'New Bie', email: 'newbie@illinois.edu' });

    const [users] = await conn.query("SELECT full_name, email, invited_at FROM Users WHERE net_id = 'newbie'");
    expect(users[0].full_name).toBe('New Bie');
    expect(users[0].email).toBe('newbie@illinois.edu');
    // The invitation is over once they arrive.
    expect(users[0].invited_at).toBeNull();

    const [memberships] = await conn.query("SELECT role FROM RSO_Memberships WHERE net_id = 'newbie'");
    expect(memberships[0].role).toBe('Board');
  });
});
