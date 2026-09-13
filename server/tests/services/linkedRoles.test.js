import { describe, it, expect, vi, beforeEach } from 'vitest';

const getLinkByNetId = vi.hoisted(() => vi.fn());
const setLinkAuthorization = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/discordLinks.ts', () => ({
  getLinkByNetId, setLinkAuthorization,
  getLinkByDiscordUserId: vi.fn(), getLinkWithMemberships: vi.fn(),
  openLinkSession: vi.fn(), getLinkSession: vi.fn(), completeLinkSession: vi.fn(),
  linkAccount: vi.fn(), deleteLinkByDiscordUserId: vi.fn(), deleteLinkByNetId: vi.fn(),
  SESSION_MINUTES: 10,
}));

const getUserMemberships = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/rso.js', () => ({
  getUserMemberships, getMembership: vi.fn(),
}));

const { seal, keyFromHex } = await import('../../lib/secretBox.js');
const linkedRoles = await import('../../services/linkedRoles.js');

const KEY_HEX = 'c'.repeat(64);
const KEY = keyFromHex(KEY_HEX);
const ENV = {
  DISCORD_CLIENT_ID: '900000000000000001',
  DISCORD_CLIENT_SECRET: 'a-client-secret',
  DISCORD_LINK_KEY: KEY_HEX,
};

/** A fetch that answers each call from a queue and records what it was asked. */
function fakeFetch(answers) {
  const calls = [];
  const fn = vi.fn(async (url, options) => {
    calls.push({ url, options, body: options?.body });
    const answer = answers.shift() ?? { ok: true, body: {} };
    return {
      ok: answer.ok !== false,
      status: answer.status ?? (answer.ok === false ? 400 : 200),
      json: async () => answer.body ?? {},
      text: async () => JSON.stringify(answer.body ?? {}),
    };
  });
  fn.calls = calls;
  return fn;
}

const TOKEN_ANSWER = { body: { access_token: 'an-access-token', refresh_token: 'a-new-refresh-token' } };

/**
 * The three facts Discord servers can require a role on.
 *
 * Nothing here is allowed to reach Discord in a test, so every call goes
 * through a fetch the test hands in. What is asserted is what the web platform
 * would send: that the authorization is refreshed from the sealed column
 * rather than stored in the clear, that the rotated refresh token is sealed
 * again, and that a person with no authorization is passed over in silence
 * rather than treated as a failure.
 */
describe('the linked role facts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLinkByNetId.mockResolvedValue({
      discordUserId: '123456789012345678', netId: 'alice',
      linkedAt: '2026-09-04 18:32:11',
      authorization: seal('a-refresh-token', KEY),
    });
    getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Member' }]);
  });

  describe('whether it is configured at all', () => {
    it('is configured when the application and the key are both set', () => {
      expect(linkedRoles.isConfigured(ENV)).toBe(true);
    });

    it('is not configured without a client identifier or without a key', () => {
      expect(linkedRoles.isConfigured({ ...ENV, DISCORD_CLIENT_ID: '' })).toBe(false);
      expect(linkedRoles.isConfigured({ ...ENV, DISCORD_LINK_KEY: '' })).toBe(false);
      expect(linkedRoles.isConfigured({})).toBe(false);
    });
  });

  describe('registering the three fields', () => {
    it('puts the schema to the application, with an application token', async () => {
      const fetchImpl = fakeFetch([{ body: { access_token: 'an-application-token' } }, { body: [] }]);
      const result = await linkedRoles.registerMetadata({ fetchImpl, env: ENV });
      expect(result).toEqual({ registered: true });

      expect(fetchImpl.calls[0].url).toBe('https://discord.com/api/v10/oauth2/token');
      expect(String(fetchImpl.calls[0].body)).toContain('grant_type=client_credentials');

      const put = fetchImpl.calls[1];
      expect(put.url).toBe('https://discord.com/api/v10/applications/900000000000000001/role-connections/metadata');
      expect(put.options.method).toBe('PUT');
      expect(put.options.headers.Authorization).toBe('Bearer an-application-token');
      expect(JSON.parse(put.body).map(field => field.key)).toEqual(['verified', 'board', 'linked_since']);
    });

    it('does nothing at all when Discord linking is not configured', async () => {
      const fetchImpl = fakeFetch([]);
      expect(await linkedRoles.registerMetadata({ fetchImpl, env: {} }))
        .toEqual({ registered: false, reason: 'not_configured' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reports a refusal from Discord rather than throwing', async () => {
      const fetchImpl = fakeFetch([{ ok: false, status: 401, body: { message: 'no' } }]);
      expect(await linkedRoles.registerMetadata({ fetchImpl, env: ENV }))
        .toEqual({ registered: false, reason: 'discord_refused' });
    });
  });

  describe('pushing the facts for a person', () => {
    it('refreshes the authorization and puts the three facts', async () => {
      const fetchImpl = fakeFetch([TOKEN_ANSWER, { body: {} }]);
      const result = await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV });
      expect(result).toEqual({ pushed: true });

      const refresh = fetchImpl.calls[0];
      expect(refresh.url).toBe('https://discord.com/api/v10/oauth2/token');
      expect(String(refresh.body)).toContain('grant_type=refresh_token');
      expect(String(refresh.body)).toContain('refresh_token=a-refresh-token');

      const put = fetchImpl.calls[1];
      expect(put.url).toBe('https://discord.com/api/v10/users/@me/applications/900000000000000001/role-connection');
      expect(put.options.method).toBe('PUT');
      expect(put.options.headers.Authorization).toBe('Bearer an-access-token');
      expect(JSON.parse(put.body)).toEqual({
        platform_name: 'VIA',
        metadata: { verified: 1, board: 0, linked_since: '2026-09-04' },
      });
    });

    it('says the person is on a board when any membership says so', async () => {
      getUserMemberships.mockResolvedValue([{ rso_id: 1, role: 'Member' }, { rso_id: 2, role: 'Board' }]);
      const fetchImpl = fakeFetch([TOKEN_ANSWER, { body: {} }]);
      await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV });
      expect(JSON.parse(fetchImpl.calls[1].body).metadata.board).toBe(1);
    });

    it('seals the rotated refresh token back into the row', async () => {
      const fetchImpl = fakeFetch([TOKEN_ANSWER, { body: {} }]);
      await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV });
      expect(setLinkAuthorization).toHaveBeenCalledTimes(1);
      const [netId, sealed] = setLinkAuthorization.mock.calls[0];
      expect(netId).toBe('alice');
      const { open } = await import('../../lib/secretBox.js');
      expect(open(sealed, KEY)).toBe('a-new-refresh-token');
    });

    it('passes over somebody who declined the linked roles step', async () => {
      getLinkByNetId.mockResolvedValue({ netId: 'alice', authorization: null });
      const fetchImpl = fakeFetch([]);
      expect(await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV }))
        .toEqual({ pushed: false, reason: 'no_authorization' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('passes over somebody with no link at all', async () => {
      getLinkByNetId.mockResolvedValue(null);
      const fetchImpl = fakeFetch([]);
      expect(await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV }))
        .toEqual({ pushed: false, reason: 'not_linked' });
    });

    it('forgets an authorization Discord will no longer refresh', async () => {
      const fetchImpl = fakeFetch([{ ok: false, status: 400, body: { error: 'invalid_grant' } }]);
      expect(await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV }))
        .toEqual({ pushed: false, reason: 'refresh_refused' });
      expect(setLinkAuthorization).toHaveBeenCalledWith('alice', null);
    });

    it('reports a refusal of the push itself rather than throwing', async () => {
      const fetchImpl = fakeFetch([TOKEN_ANSWER, { ok: false, status: 401, body: {} }]);
      expect(await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV }))
        .toEqual({ pushed: false, reason: 'discord_refused' });
    });

    it('reports a network failure rather than throwing', async () => {
      const fetchImpl = vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND'); });
      expect(await linkedRoles.pushFacts('alice', { fetchImpl, env: ENV }))
        .toEqual({ pushed: false, reason: 'unreachable' });
    });

    it('does nothing when Discord linking is not configured', async () => {
      const fetchImpl = fakeFetch([]);
      expect(await linkedRoles.pushFacts('alice', { fetchImpl, env: {} }))
        .toEqual({ pushed: false, reason: 'not_configured' });
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('clearing the facts when somebody unlinks', () => {
    it('puts an empty set of facts', async () => {
      const fetchImpl = fakeFetch([TOKEN_ANSWER, { body: {} }]);
      expect(await linkedRoles.clearFacts('alice', { fetchImpl, env: ENV })).toEqual({ cleared: true });
      expect(JSON.parse(fetchImpl.calls[1].body)).toEqual({ platform_name: 'VIA', metadata: {} });
    });

    it('is quiet when the person never granted the linked roles step', async () => {
      getLinkByNetId.mockResolvedValue({ netId: 'alice', authorization: null });
      const fetchImpl = fakeFetch([]);
      expect(await linkedRoles.clearFacts('alice', { fetchImpl, env: ENV }))
        .toEqual({ cleared: false, reason: 'no_authorization' });
    });
  });
});
