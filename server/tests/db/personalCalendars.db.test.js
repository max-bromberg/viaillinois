import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end;

/**
 * A personal calendar is one address per person, guarded by a token that is
 * stored only as its hash, carrying the RSOs the person follows.
 */
describe('Personal_Calendars', () => {
  beforeAll(async () => { ({ query, end } = await migratedDb()); }, 180_000);
  afterAll(async () => { await end(); });

  beforeEach(async () => {
    await query('DELETE FROM Personal_Calendars');
    await query('DELETE FROM Users');
    await query("INSERT INTO Users (net_id, full_name, email) VALUES ('alice', 'Alice', 'alice@illinois.edu')");
  });

  const HASH = 'a'.repeat(64);

  const calendar = (netId, rsoIds) => query(
    'INSERT INTO Personal_Calendars (net_id, token_hash, rso_ids) VALUES (?, ?, ?)',
    [netId, HASH, rsoIds === null ? null : JSON.stringify(rsoIds)]
  );

  it('holds the followed RSOs, or null for every RSO', async () => {
    await calendar('alice', null);
    const [row] = await query('SELECT rso_ids, rotated_at FROM Personal_Calendars');
    expect(row.rso_ids).toBeNull();
    expect(row.rotated_at).toMatch(/^\d{4}-/);
  });

  it('gives back the RSO set it was given', async () => {
    await calendar('alice', [1, 4, 9]);
    const [row] = await query('SELECT rso_ids FROM Personal_Calendars');
    const ids = typeof row.rso_ids === 'string' ? JSON.parse(row.rso_ids) : row.rso_ids;
    expect(ids).toEqual([1, 4, 9]);
  });

  it('is one calendar per person', async () => {
    await calendar('alice', null);
    await expect(calendar('alice', [1])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('never stores the token itself, only a hash of a fixed length', async () => {
    const [column] = await query("SHOW COLUMNS FROM Personal_Calendars LIKE 'token_hash'");
    expect(column.Type).toBe('char(64)');
    expect(await query("SHOW COLUMNS FROM Personal_Calendars LIKE 'token'")).toHaveLength(0);
  });

  it('goes with the person when the person goes', async () => {
    await calendar('alice', null);
    await query("DELETE FROM Users WHERE net_id = 'alice'");
    expect(await query('SELECT * FROM Personal_Calendars')).toHaveLength(0);
  });
});
