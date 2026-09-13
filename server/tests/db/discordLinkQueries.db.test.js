import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end, links;

/**
 * Everything the link flow writes and reads, against the real tables.
 *
 * A link is one Discord account and one NetID, and the flow has to be able to
 * replace an earlier link on either side without ever leaving two. The session
 * is the short lived handshake in front of it, and the lookup is what the bot
 * asks for on every interaction, so it carries the memberships with it rather
 * than making the bot ask twice.
 */
describe('the link queries', () => {
  beforeAll(async () => {
    ({ query, end } = await migratedDb());
    links = await import('../../db/queries/discordLinks.ts');
  }, 180_000);
  afterAll(async () => { await end(); });

  beforeEach(async () => {
    await query('DELETE FROM Link_Sessions');
    await query('DELETE FROM Discord_Links');
    await query('DELETE FROM RSO_Memberships');
    await query('DELETE FROM RSOs');
    await query('DELETE FROM Users');
    await query("INSERT INTO Users (net_id, full_name, email, is_global_admin) VALUES ('alice', 'Alice Adams', 'alice@illinois.edu', 0)");
    await query("INSERT INTO Users (net_id, full_name, email, is_global_admin) VALUES ('bob', 'Bob Brown', 'bob@illinois.edu', 1)");
    await query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE')");
    await query("INSERT INTO RSOs (rso_id, name) VALUES (2, 'HKN')");
  });

  describe('opening a link session', () => {
    it('writes a session with a random identifier of forty three characters', async () => {
      const session = await links.openLinkSession({ discordUserId: '123456789012345678' });
      expect(session.sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const rows = await query('SELECT * FROM Link_Sessions');
      expect(rows).toHaveLength(1);
      expect(rows[0].discord_user_id).toBe('123456789012345678');
      expect(rows[0].completed_at).toBeNull();
    });

    it('sets the expiry ten minutes after it was opened', async () => {
      const session = await links.openLinkSession({ discordUserId: '123456789012345678' });
      const rows = await query('SELECT created_at, expires_at FROM Link_Sessions');
      const minutes = (new Date(`${rows[0].expires_at}Z`) - new Date(`${rows[0].created_at}Z`)) / 60000;
      expect(minutes).toBeCloseTo(10, 0);
      expect(session.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('replaces an open session for the same Discord account', async () => {
      const first = await links.openLinkSession({ discordUserId: '123456789012345678' });
      const second = await links.openLinkSession({ discordUserId: '123456789012345678' });
      const rows = await query('SELECT session_id FROM Link_Sessions');
      expect(rows.map(r => r.session_id)).toEqual([second.sessionId]);
      expect(await links.getLinkSession(first.sessionId)).toBeNull();
    });

    it('leaves the session of another Discord account alone', async () => {
      const other = await links.openLinkSession({ discordUserId: '223456789012345678' });
      await links.openLinkSession({ discordUserId: '123456789012345678' });
      expect(await links.getLinkSession(other.sessionId)).not.toBeNull();
    });

    it('leaves a completed session in place as a record', async () => {
      const first = await links.openLinkSession({ discordUserId: '123456789012345678' });
      await links.completeLinkSession(first.sessionId);
      await links.openLinkSession({ discordUserId: '123456789012345678' });
      expect((await links.getLinkSession(first.sessionId)).completedAt).not.toBeNull();
    });
  });

  describe('completing a session', () => {
    it('stamps the moment it was completed', async () => {
      const { sessionId } = await links.openLinkSession({ discordUserId: '123456789012345678' });
      expect((await links.getLinkSession(sessionId)).completedAt).toBeNull();
      await links.completeLinkSession(sessionId);
      expect((await links.getLinkSession(sessionId)).completedAt).toMatch(/^\d{4}-\d{2}-\d{2} /);
    });

    it('answers null for a session nobody opened', async () => {
      expect(await links.getLinkSession('z'.repeat(43))).toBeNull();
    });
  });

  describe('writing the link', () => {
    it('records the link with the time it was made', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      const rows = await query('SELECT * FROM Discord_Links');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ discord_user_id: '123456789012345678', net_id: 'alice' });
      expect(rows[0].discord_authorization).toBeNull();
    });

    it('replaces an earlier link for the same NetID', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      await links.linkAccount({ discordUserId: '223456789012345678', netId: 'alice' });
      const rows = await query('SELECT discord_user_id FROM Discord_Links');
      expect(rows.map(r => r.discord_user_id)).toEqual(['223456789012345678']);
    });

    it('replaces an earlier link for the same Discord account', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'bob' });
      const rows = await query('SELECT net_id FROM Discord_Links');
      expect(rows.map(r => r.net_id)).toEqual(['bob']);
    });

    /**
     * A link displaces whatever stood on either side of it, and the Discord
     * bot has to hear about each one it displaced. Silently, the bot goes on
     * holding an account link that no longer exists, and a person who moved
     * their VIA account to a second Discord account is still acted for as
     * themselves from the first one.
     */
    it('says nothing was displaced when nothing was', async () => {
      const displaced = await links.linkAccount({
        discordUserId: '123456789012345678', netId: 'alice',
      });
      expect(displaced).toEqual([]);
    });

    it('says which link it displaced when the NetID had another Discord account', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      const displaced = await links.linkAccount({
        discordUserId: '223456789012345678', netId: 'alice',
      });
      expect(displaced).toEqual([{ discordUserId: '123456789012345678', netId: 'alice' }]);
    });

    it('says which link it displaced when the Discord account belonged to somebody else', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      const displaced = await links.linkAccount({
        discordUserId: '123456789012345678', netId: 'bob',
      });
      expect(displaced).toEqual([{ discordUserId: '123456789012345678', netId: 'alice' }]);
    });

    it('says both when a link displaces one on each side', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      await links.linkAccount({ discordUserId: '223456789012345678', netId: 'bob' });
      const displaced = await links.linkAccount({
        discordUserId: '123456789012345678', netId: 'bob',
      });
      expect(displaced).toHaveLength(2);
      expect(displaced).toEqual(expect.arrayContaining([
        { discordUserId: '123456789012345678', netId: 'alice' },
        { discordUserId: '223456789012345678', netId: 'bob' },
      ]));
    });

    it('does not call the link it is writing a link it displaced', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      const displaced = await links.linkAccount({
        discordUserId: '123456789012345678', netId: 'alice',
      });
      expect(displaced).toEqual([]);
    });

    it('keeps the sealed authorization as bytes when one is given', async () => {
      await links.linkAccount({
        discordUserId: '123456789012345678', netId: 'alice',
        authorization: Buffer.from([0, 255, 7]),
      });
      const rows = await query('SELECT discord_authorization FROM Discord_Links');
      expect([...rows[0].discord_authorization]).toEqual([0, 255, 7]);
    });

    it('reads a link back by NetID, with its authorization', async () => {
      await links.linkAccount({
        discordUserId: '123456789012345678', netId: 'alice', authorization: Buffer.from([1, 2]),
      });
      const link = await links.getLinkByNetId('alice');
      expect(link.discordUserId).toBe('123456789012345678');
      expect([...link.authorization]).toEqual([1, 2]);
      expect(await links.getLinkByNetId('bob')).toBeNull();
    });

    it('replaces the authorization on its own', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      await links.setLinkAuthorization('alice', Buffer.from([9]));
      expect([...(await links.getLinkByNetId('alice')).authorization]).toEqual([9]);
    });
  });

  describe('the lookup the bot makes on every interaction', () => {
    beforeEach(async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      await query("INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES ('alice', 1, 'Board')");
      await query("INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES ('alice', 2, 'Member')");
    });

    it('answers the person, their flag and their memberships', async () => {
      const found = await links.getLinkWithMemberships('123456789012345678');
      expect(found).toMatchObject({
        discord_user_id: '123456789012345678',
        net_id: 'alice',
        display_name: 'Alice Adams',
        is_global_admin: false,
      });
      expect(found.linked_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
      expect(found.memberships).toEqual([
        { rso_id: 1, rso_name: 'IEEE', role: 'Board' },
        { rso_id: 2, rso_name: 'HKN', role: 'Member' },
      ]);
    });

    it('answers null for an account nobody linked', async () => {
      expect(await links.getLinkWithMemberships('999999999999999999')).toBeNull();
    });

    it('answers an empty list of memberships rather than nothing', async () => {
      await links.linkAccount({ discordUserId: '223456789012345678', netId: 'bob' });
      const found = await links.getLinkWithMemberships('223456789012345678');
      expect(found.memberships).toEqual([]);
      expect(found.is_global_admin).toBe(true);
    });
  });

  /**
   * A link session is a handshake that lasts ten minutes, and every one of
   * them, used or abandoned, stays in the table for ever unless something
   * removes it. Each row holds a Discord identifier, so the table is a list of
   * who asked to link and when, kept long after it can be used for anything.
   */
  describe('pruning the sessions that are done with', () => {
    const at = offsetMinutes => {
      const when = new Date(Date.now() + offsetMinutes * 60_000);
      return when.toISOString().slice(0, 19).replace('T', ' ');
    };
    const session = async (id, expiresAt, completedAt = null) => query(
      'INSERT INTO Link_Sessions (session_id, discord_user_id, created_at, expires_at, completed_at) VALUES (?, ?, ?, ?, ?)',
      [id.padEnd(43, 'x'), '123456789012345678', at(-60 * 24 * 3), expiresAt, completedAt],
    );

    it('removes a session that expired more than a day ago', async () => {
      await session('old', at(-60 * 30));
      const removed = await links.pruneLinkSessions();
      expect(removed).toBe(1);
      expect(await query('SELECT session_id FROM Link_Sessions')).toEqual([]);
    });

    it('removes a completed session once it is past the same window', async () => {
      await session('done', at(-60 * 30), at(-60 * 31));
      await links.pruneLinkSessions();
      expect(await query('SELECT session_id FROM Link_Sessions')).toEqual([]);
    });

    it('keeps a session that has only just expired, and one that is still open', async () => {
      await session('recent', at(-5));
      await session('live', at(5));
      const removed = await links.pruneLinkSessions();
      expect(removed).toBe(0);
      expect(await query('SELECT session_id FROM Link_Sessions')).toHaveLength(2);
    });
  });

  describe('unlinking', () => {
    it('removes the row and answers what it removed', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      const removed = await links.deleteLinkByDiscordUserId('123456789012345678');
      expect(removed).toMatchObject({ discordUserId: '123456789012345678', netId: 'alice' });
      expect(await query('SELECT * FROM Discord_Links')).toHaveLength(0);
    });

    it('answers null when there was nothing to remove', async () => {
      expect(await links.deleteLinkByDiscordUserId('999999999999999999')).toBeNull();
    });

    it('removes by NetID as well, for the account page', async () => {
      await links.linkAccount({ discordUserId: '123456789012345678', netId: 'alice' });
      const removed = await links.deleteLinkByNetId('alice');
      expect(removed).toMatchObject({ discordUserId: '123456789012345678', netId: 'alice' });
      expect(await links.deleteLinkByNetId('alice')).toBeNull();
    });
  });
});
