import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end;

// One database for the whole file. The pool is a module singleton, so a
// suite that ended it would leave the next suite in this file with nothing.
beforeAll(async () => { ({ query, end } = await migratedDb()); }, 180_000);
afterAll(async () => { await end(); });

/**
 * A link is the whole basis of acting as a person from Discord, so the table
 * has to make the two impossible states impossible: one NetID with two Discord
 * accounts, and one Discord account with two NetIDs.
 */
describe('Discord_Links', () => {
  beforeEach(async () => {
    await query('DELETE FROM Discord_Links');
    await query('DELETE FROM Link_Sessions');
    await query('DELETE FROM Users');
    await query("INSERT INTO Users (net_id, full_name, email) VALUES ('alice', 'Alice', 'alice@illinois.edu')");
    await query("INSERT INTO Users (net_id, full_name, email) VALUES ('bob', 'Bob', 'bob@illinois.edu')");
  });

  const link = (discordUserId, netId) => query(
    'INSERT INTO Discord_Links (discord_user_id, net_id) VALUES (?, ?)', [discordUserId, netId]
  );

  it('records a link with the time it was made', async () => {
    await link('123456789012345678', 'alice');
    const rows = await query('SELECT * FROM Discord_Links');
    expect(rows).toHaveLength(1);
    expect(rows[0].linked_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect(rows[0].discord_authorization).toBeNull();
  });

  it('keeps a Discord identifier as the string it is, not a number', async () => {
    // Snowflakes exceed what a double can hold exactly, so a column that
    // rounded them would silently link the wrong account.
    await link('999999999999999999', 'alice');
    const rows = await query('SELECT discord_user_id FROM Discord_Links');
    expect(rows[0].discord_user_id).toBe('999999999999999999');
  });

  it('refuses a second Discord account for the same NetID', async () => {
    await link('123456789012345678', 'alice');
    await expect(link('223456789012345678', 'alice')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('refuses a second NetID for the same Discord account', async () => {
    await link('123456789012345678', 'alice');
    await expect(link('123456789012345678', 'bob')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('refuses a link to a NetID VIA has never seen', async () => {
    await expect(link('123456789012345678', 'nobody')).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  it('removes the link when the person is removed', async () => {
    await link('123456789012345678', 'alice');
    await query("DELETE FROM Users WHERE net_id = 'alice'");
    expect(await query('SELECT * FROM Discord_Links')).toHaveLength(0);
  });

  it('holds an encrypted authorization as bytes, not text', async () => {
    await link('123456789012345678', 'alice');
    await query('UPDATE Discord_Links SET discord_authorization = ? WHERE discord_user_id = ?',
      [Buffer.from([0, 255, 1, 2]), '123456789012345678']);
    const rows = await query('SELECT discord_authorization FROM Discord_Links');
    expect(Buffer.isBuffer(rows[0].discord_authorization)).toBe(true);
    expect([...rows[0].discord_authorization]).toEqual([0, 255, 1, 2]);
  });
});

describe('Link_Sessions', () => {
  beforeEach(async () => { await query('DELETE FROM Link_Sessions'); });

  const SESSION = 'a'.repeat(43);

  it('opens a session that is not yet completed', async () => {
    await query(
      `INSERT INTO Link_Sessions (session_id, discord_user_id, expires_at)
       VALUES (?, '123456789012345678', '2026-09-04 12:10:00')`, [SESSION]
    );
    const rows = await query('SELECT * FROM Link_Sessions');
    expect(rows[0].completed_at).toBeNull();
    expect(rows[0].created_at).toMatch(/^\d{4}-/);
  });

  it('refuses two sessions with the same identifier', async () => {
    const insert = () => query(
      `INSERT INTO Link_Sessions (session_id, discord_user_id, expires_at)
       VALUES (?, '123456789012345678', '2026-09-04 12:10:00')`, [SESSION]
    );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
});
