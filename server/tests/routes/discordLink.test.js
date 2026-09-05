import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));

const linksDb = vi.hoisted(() => ({
  getLinkByDiscordUserId: vi.fn(), getLinkByNetId: vi.fn(), getLinkWithMemberships: vi.fn(),
  openLinkSession: vi.fn(), getLinkSession: vi.fn(), completeLinkSession: vi.fn(),
  linkAccount: vi.fn(), setLinkAuthorization: vi.fn(),
  deleteLinkByDiscordUserId: vi.fn(), deleteLinkByNetId: vi.fn(),
  SESSION_MINUTES: 10,
}));
vi.mock('../../db/queries/discordLinks.ts', () => linksDb);

vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const recordLinkCompleted = vi.hoisted(() => vi.fn());
vi.mock('../../db/queries/outbox.ts', async () => ({
  ...(await import('../support/outboxMock.js')).outboxMock(),
  recordLinkCompleted,
}));

const pushFacts = vi.hoisted(() => vi.fn());
vi.mock('../../services/linkedRoles.js', () => ({
  pushFacts, clearFacts: vi.fn(), registerMetadata: vi.fn(),
  isConfigured: () => true, METADATA_SCHEMA: [], PLATFORM_NAME: 'VIA',
}));

process.env.JWT_SECRET = 'a-test-secret';
process.env.CLIENT_URL = 'https://viaillinois.com';
process.env.SERVER_URL = 'https://viaillinois.com';

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');
const { seal, keyFromHex, open } = await import('../../lib/secretBox.js');

const KEY_HEX = 'd'.repeat(64);
const SESSION = 'hLbQ2mXk9wR4tYu7iOp1aSdFgHjKlZxCvBnM3qWe5rT';
const DISCORD_USER = '204255221017214977';
const PAGE = `https://viaillinois.com/link/discord/${SESSION}`;

const asRosa = req => req.set('Cookie', [`via_token=${signToken({ net_id: 'rgarcia7', is_global_admin: false })}`]);

/** A fetch that answers the token exchange and then the identity call. */
function fakeDiscord({ token = {}, identity = {}, tokenOk = true, identityOk = true } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, options) => {
    calls.push({ url, options, body: options?.body });
    if (String(url).endsWith('/oauth2/token')) {
      return {
        ok: tokenOk, status: tokenOk ? 200 : 400,
        json: async () => ({
          access_token: 'an-access-token', refresh_token: 'a-refresh-token',
          scope: 'identify', ...token,
        }),
        text: async () => '',
      };
    }
    return {
      ok: identityOk, status: identityOk ? 200 : 401,
      json: async () => ({ id: DISCORD_USER, username: 'rosa', ...identity }),
      text: async () => '',
    };
  });
  fn.calls = calls;
  return fn;
}

/** The state the start route signs, rebuilt so the callback can be called on its own. */
const state = (session = SESSION, roles = false) =>
  jwt.sign({ session, roles }, 'a-test-secret', { expiresIn: '15m' });

const OPEN_SESSION = {
  sessionId: SESSION, discordUserId: DISCORD_USER,
  createdAt: '2026-09-04 18:30:00', expiresAt: '2999-09-04 18:40:00', completedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DISCORD_CLIENT_ID = '900000000000000001';
  process.env.DISCORD_CLIENT_SECRET = 'a-client-secret';
  process.env.DISCORD_LINK_KEY = KEY_HEX;
  linksDb.getLinkSession.mockResolvedValue({ ...OPEN_SESSION });
  vi.stubGlobal('fetch', fakeDiscord());
});

afterEach(() => { vi.unstubAllGlobals(); });

/**
 * Starting the Discord authorization.
 *
 * The person is signed in with their own NetID by the time they reach this, so
 * what the authorization proves is the other half: that they hold the Discord
 * account the bot opened the session for.
 */
describe('GET /auth/discord/start', () => {
  it('sends the person to Discord with the identify scope and a signed state', async () => {
    const res = await asRosa(request(app).get(`/auth/discord/start?session=${SESSION}`));
    expect(res.status).toBe(302);
    const to = new URL(res.headers.location);
    expect(to.origin + to.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(to.searchParams.get('client_id')).toBe('900000000000000001');
    expect(to.searchParams.get('response_type')).toBe('code');
    expect(to.searchParams.get('redirect_uri')).toBe('https://viaillinois.com/auth/discord/callback');
    expect(to.searchParams.get('scope')).toBe('identify');
    expect(to.searchParams.get('prompt')).toBe('consent');

    const carried = jwt.verify(to.searchParams.get('state'), 'a-test-secret');
    expect(carried).toMatchObject({ session: SESSION, roles: false });
  });

  it('asks for the linked roles scope as well when the person left the box ticked', async () => {
    const res = await asRosa(request(app).get(`/auth/discord/start?session=${SESSION}&roles=1`));
    const to = new URL(res.headers.location);
    expect(to.searchParams.get('scope')).toBe('identify role_connections.write');
    expect(jwt.verify(to.searchParams.get('state'), 'a-test-secret')).toMatchObject({ roles: true });
  });

  it('needs somebody signed in', async () => {
    const res = await request(app).get(`/auth/discord/start?session=${SESSION}`);
    expect(res.status).toBe(401);
  });

  it('says so when Discord linking is not configured on this deployment', async () => {
    delete process.env.DISCORD_CLIENT_ID;
    const res = await asRosa(request(app).get(`/auth/discord/start?session=${SESSION}`));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/Discord/);
  });

  it('sends somebody back to the page when the session has expired', async () => {
    linksDb.getLinkSession.mockResolvedValue({ ...OPEN_SESSION, expiresAt: '2020-01-01 00:00:00' });
    const res = await asRosa(request(app).get(`/auth/discord/start?session=${SESSION}`));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PAGE}?reason=expired`);
  });

  it('sends somebody back to the page when the session is not one we opened', async () => {
    linksDb.getLinkSession.mockResolvedValue(null);
    const res = await asRosa(request(app).get(`/auth/discord/start?session=${SESSION}`));
    expect(res.headers.location).toBe(`${PAGE}?reason=unknown`);
  });
});

/**
 * Coming back from Discord.
 *
 * Everything that can go wrong here has to be refused rather than worked
 * around, because what this writes is the statement that one Discord account
 * is one person.
 */
describe('GET /auth/discord/callback', () => {
  const callback = (params) =>
    asRosa(request(app).get(`/auth/discord/callback?${new URLSearchParams(params).toString()}`));

  it('writes the link, completes the session, and confirms', async () => {
    const res = await callback({ code: 'a-code', state: state() });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${PAGE}/done`);

    expect(linksDb.linkAccount).toHaveBeenCalledWith({
      discordUserId: DISCORD_USER, netId: 'rgarcia7', authorization: null,
    });
    expect(linksDb.completeLinkSession).toHaveBeenCalledWith(SESSION);
    expect(recordLinkCompleted).toHaveBeenCalledWith({
      discordUserId: DISCORD_USER, netId: 'rgarcia7',
    });
  });

  it('exchanges the code with the application secret, not with anything the browser sent', async () => {
    await callback({ code: 'a-code', state: state() });
    const exchange = globalThis.fetch.calls[0];
    expect(exchange.url).toBe('https://discord.com/api/v10/oauth2/token');
    expect(String(exchange.body)).toContain('grant_type=authorization_code');
    expect(String(exchange.body)).toContain('code=a-code');
    expect(String(exchange.body)).toContain('client_secret=a-client-secret');
  });

  it('seals the refresh token and pushes the facts when the roles scope was granted', async () => {
    vi.stubGlobal('fetch', fakeDiscord({ token: { scope: 'identify role_connections.write' } }));
    const res = await callback({ code: 'a-code', state: state(SESSION, true) });
    expect(res.headers.location).toBe(`${PAGE}/done`);

    const { authorization } = linksDb.linkAccount.mock.calls[0][0];
    expect(open(authorization, keyFromHex(KEY_HEX))).toBe('a-refresh-token');
    expect(pushFacts).toHaveBeenCalledWith('rgarcia7');
  });

  it('keeps no authorization and pushes nothing when the person declined the roles step', async () => {
    await callback({ code: 'a-code', state: state() });
    expect(linksDb.linkAccount.mock.calls[0][0].authorization).toBeNull();
    expect(pushFacts).not.toHaveBeenCalled();
  });

  it('refuses a state somebody made up or changed', async () => {
    const res = await callback({ code: 'a-code', state: jwt.sign({ session: SESSION }, 'another-secret') });
    expect(res.headers.location).toBe('https://viaillinois.com/link/discord/unknown?reason=state');
    expect(linksDb.linkAccount).not.toHaveBeenCalled();
  });

  it('refuses a callback with no state at all', async () => {
    const res = await callback({ code: 'a-code' });
    expect(res.headers.location).toBe('https://viaillinois.com/link/discord/unknown?reason=state');
    expect(linksDb.linkAccount).not.toHaveBeenCalled();
  });

  it('refuses when the Discord account is not the one the session was opened for', async () => {
    vi.stubGlobal('fetch', fakeDiscord({ identity: { id: '999999999999999999' } }));
    const res = await callback({ code: 'a-code', state: state() });
    expect(res.headers.location).toBe(`${PAGE}?reason=mismatch`);
    expect(linksDb.linkAccount).not.toHaveBeenCalled();
    expect(recordLinkCompleted).not.toHaveBeenCalled();
  });

  it('refuses a session that expired while the person was on Discord', async () => {
    linksDb.getLinkSession.mockResolvedValue({ ...OPEN_SESSION, expiresAt: '2020-01-01 00:00:00' });
    const res = await callback({ code: 'a-code', state: state() });
    expect(res.headers.location).toBe(`${PAGE}?reason=expired`);
    expect(linksDb.linkAccount).not.toHaveBeenCalled();
  });

  it('refuses a session that was already used', async () => {
    linksDb.getLinkSession.mockResolvedValue({ ...OPEN_SESSION, completedAt: '2026-09-04 18:35:00' });
    const res = await callback({ code: 'a-code', state: state() });
    expect(res.headers.location).toBe(`${PAGE}?reason=completed`);
    expect(linksDb.linkAccount).not.toHaveBeenCalled();
  });

  it('refuses a session nobody opened', async () => {
    linksDb.getLinkSession.mockResolvedValue(null);
    const res = await callback({ code: 'a-code', state: state() });
    expect(res.headers.location).toBe(`${PAGE}?reason=unknown`);
  });

  it('sends the person back when Discord refuses the exchange', async () => {
    vi.stubGlobal('fetch', fakeDiscord({ tokenOk: false }));
    const res = await callback({ code: 'a-code', state: state() });
    expect(res.headers.location).toBe(`${PAGE}?reason=discord`);
    expect(linksDb.linkAccount).not.toHaveBeenCalled();
  });

  it('sends the person back when Discord will not say who they are', async () => {
    vi.stubGlobal('fetch', fakeDiscord({ identityOk: false }));
    const res = await callback({ code: 'a-code', state: state() });
    expect(res.headers.location).toBe(`${PAGE}?reason=discord`);
  });

  it('sends the person back when they pressed cancel on Discord', async () => {
    const res = await callback({ error: 'access_denied', state: state() });
    expect(res.headers.location).toBe(`${PAGE}?reason=declined`);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('needs somebody signed in, because the link is to the person signing in', async () => {
    const res = await request(app).get(`/auth/discord/callback?code=a-code&state=${state()}`);
    expect(res.status).toBe(401);
    expect(linksDb.linkAccount).not.toHaveBeenCalled();
  });

  it('links anyway when pushing the facts to Discord fails', async () => {
    vi.stubGlobal('fetch', fakeDiscord({ token: { scope: 'identify role_connections.write' } }));
    pushFacts.mockRejectedValue(new Error('Discord is down'));
    const res = await callback({ code: 'a-code', state: state(SESSION, true) });
    expect(res.headers.location).toBe(`${PAGE}/done`);
    expect(recordLinkCompleted).toHaveBeenCalled();
  });
});

/**
 * What the page asks before it draws anything: whether this session is still
 * worth offering a button for. It never says which Discord account opened it,
 * because the address travels through a direct message and a person who has
 * been sent somebody else's address learns nothing from opening it.
 */
describe('GET /api/v1/link/discord/{session}', () => {
  it('says a live session is open, and when it runs out', async () => {
    const res = await request(app).get(`/api/v1/link/discord/${SESSION}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'open', expires_at: '2999-09-04T18:40:00-05:00' });
    expect(JSON.stringify(res.body)).not.toContain(DISCORD_USER);
  });

  it('says an expired session is expired', async () => {
    linksDb.getLinkSession.mockResolvedValue({ ...OPEN_SESSION, expiresAt: '2020-01-01 00:00:00' });
    const res = await request(app).get(`/api/v1/link/discord/${SESSION}`);
    expect(res.body.status).toBe('expired');
  });

  it('says a completed session is completed', async () => {
    linksDb.getLinkSession.mockResolvedValue({ ...OPEN_SESSION, completedAt: '2026-09-04 18:35:00' });
    const res = await request(app).get(`/api/v1/link/discord/${SESSION}`);
    expect(res.body.status).toBe('completed');
  });

  it('says an unknown session is unknown, rather than refusing', async () => {
    linksDb.getLinkSession.mockResolvedValue(null);
    const res = await request(app).get(`/api/v1/link/discord/${SESSION}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'unknown' });
  });

  it('treats an identifier of the wrong shape as unknown without asking the database', async () => {
    const res = await request(app).get('/api/v1/link/discord/not-a-session');
    expect(res.body).toEqual({ status: 'unknown' });
    expect(linksDb.getLinkSession).not.toHaveBeenCalled();
  });
});
