import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end, getLinkByDiscordUserId;

/**
 * The one question the acting middleware asks: who is this Discord account.
 * The answer carries the global administrator flag so the middleware can build
 * the same req.user the cookie does, without a second query.
 */
describe('getLinkByDiscordUserId', () => {
  beforeAll(async () => {
    ({ query, end } = await migratedDb());
    ({ getLinkByDiscordUserId } = await import('../../db/queries/discordLinks.ts'));
  }, 180_000);
  afterAll(async () => { await end(); });

  beforeEach(async () => {
    await query('DELETE FROM Discord_Links');
    await query('DELETE FROM Users');
    await query("INSERT INTO Users (net_id, full_name, email, is_global_admin) VALUES ('alice', 'Alice', 'alice@illinois.edu', 0)");
    await query("INSERT INTO Users (net_id, full_name, email, is_global_admin) VALUES ('root', 'Root', 'root@illinois.edu', 1)");
    await query("INSERT INTO Discord_Links (discord_user_id, net_id) VALUES ('123456789012345678', 'alice')");
    await query("INSERT INTO Discord_Links (discord_user_id, net_id) VALUES ('223456789012345678', 'root')");
  });

  it('resolves a linked account with its administrator flag', async () => {
    expect(await getLinkByDiscordUserId('123456789012345678')).toMatchObject({ netId: 'alice', isGlobalAdmin: 0 });
    expect(await getLinkByDiscordUserId('223456789012345678')).toMatchObject({ netId: 'root', isGlobalAdmin: 1 });
  });

  it('answers null for an account nobody linked', async () => {
    expect(await getLinkByDiscordUserId('999999999999999999')).toBeNull();
  });

  it('does not match on a prefix of an identifier', async () => {
    expect(await getLinkByDiscordUserId('12345678901234567')).toBeNull();
  });
});
