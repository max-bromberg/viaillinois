import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { signToken, attachUser, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { readKey, seal } from '../lib/secretBox.js';
import { campusNow } from '../lib/timezone.js';
import { recordLinkCompleted } from '../db/queries/outbox.ts';
import { pushFacts } from '../services/linkedRoles.js';
import { getLinkSession, completeLinkSession, linkAccount } from '../db/queries/discordLinks.ts';

const router = Router();

// Throttle credential-checking endpoints to slow brute-force / credential stuffing.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// ── Dev mock login (NODE_ENV=development only) ───────────────────────────────
if (process.env.NODE_ENV === 'development') {
  router.post('/mock-login', (req, res) => {
    const { netId = 'dev_user', isAdmin = false } = req.body;
    const token = signToken({ net_id: netId, is_global_admin: isAdmin });
    res.cookie('via_token', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ net_id: netId, is_global_admin: isAdmin });
  });
}

// ── Azure AD (OIDC) ──────────────────────────────────────────────────────────
const azureConfigured = () => !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID);

router.get('/microsoft', (req, res, next) => {
  if (!azureConfigured()) return res.status(503).json({ error: 'Azure AD not configured' });
  passport.authenticate('azuread-openidconnect', { session: false })(req, res, next);
});

router.get('/microsoft/callback', (req, res, next) => {
  if (!azureConfigured()) return res.redirect((process.env.CLIENT_URL || 'http://localhost:5173') + '/login');
  passport.authenticate('azuread-openidconnect', { session: false, failureRedirect: '/login' }, (err, user) => {
    if (err || !user) return res.redirect((process.env.CLIENT_URL || 'http://localhost:5173') + '/login');
    const token = signToken(user);
    res.cookie('via_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  })(req, res, next);
});

// ── Local fallback login ─────────────────────────────────────────────────────
router.post('/login',
  loginLimiter,
  passport.authenticate('local', { session: false }),
  (req, res) => {
    const token = signToken(req.user);
    res.cookie('via_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ net_id: req.user.net_id, is_global_admin: req.user.is_global_admin });
  }
);

// ── Linking a Discord account ────────────────────────────────────────────────
router.use(createDiscordRoutes());

// ── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, (_req, res) => {
  res.clearCookie('via_token');
  res.json({ ok: true });
});


// Discord's own addresses, in one place so that a test can see at a glance
// that nothing here reaches anywhere else.
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';

/** A link session identifier is thirty two random bytes written URL safe. */
const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

/**
 * Turn the code Discord sent the browser back with into a token.
 *
 * The exchange carries the application secret, which the browser never sees,
 * so a code on its own is worth nothing to anybody who intercepts it.
 *
 * @returns {Promise<object|null>} the grant, or null when Discord refused
 */
async function exchangeCode(reach, code, redirectUri) {
  if (!code) return null;
  try {
    const res = await reach(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('exchanging the Discord authorization code failed:', err.message);
    return null;
  }
}

/**
 * Who Discord says the person is. The identify scope answers with the account
 * identifier and nothing else this flow needs.
 *
 * @returns {Promise<object|null>}
 */
async function discordIdentity(reach, accessToken) {
  try {
    const res = await reach(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('reading the Discord account behind an authorization failed:', err.message);
    return null;
  }
}

/**
 * Linking a Discord account to a NetID.
 *
 * The bot opens a session for the Discord account it observed and sends the
 * person here. By the time they arrive they have signed in with their own
 * NetID, so the only thing left to prove is that they hold that Discord
 * account, which is what Discord's own authorization proves. The two halves
 * meet in the callback, where the identifier Discord reports is compared with
 * the one the session was opened for.
 *
 * Nothing is written unless both halves agree. Every refusal sends the person
 * back to the same page with a reason, so all of the wording a person reads
 * lives on that page rather than being spread across redirects.
 *
 * @param {{ fetchImpl?: typeof fetch }} [options] the way to reach Discord,
 *   handed in by the tests so that no test can reach the real Discord
 */
export function createDiscordRoutes({ fetchImpl } = {}) {
  const routes = Router();
  const reach = (...args) => (fetchImpl ?? globalThis.fetch)(...args);

  const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const serverUrl = () => (process.env.SERVER_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const redirectUri = () => `${serverUrl()}/auth/discord/callback`;
  const configured = () => !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

  /** Back to the link page, which says what happened in its own words. */
  const backToPage = (res, session, reason) =>
    res.redirect(`${clientUrl()}/link/discord/${session || 'unknown'}?reason=${reason}`);

  /**
   * Whether this session can still be used, and why not when it cannot.
   * @returns {Promise<{ ok: true, session: object }|{ ok: false, reason: string }>}
   */
  async function readSession(sessionId) {
    if (!SESSION_ID.test(String(sessionId ?? ''))) return { ok: false, reason: 'unknown' };
    const session = await getLinkSession(sessionId);
    if (!session) return { ok: false, reason: 'unknown' };
    if (session.completedAt) return { ok: false, reason: 'completed' };
    if (String(session.expiresAt) <= campusNow()) return { ok: false, reason: 'expired' };
    return { ok: true, session };
  }

  routes.get('/discord/start', requireAuth, async (req, res, next) => {
    try {
      if (!configured()) {
        return res.status(503).json({
          error: 'Discord linking is not configured on this deployment of VIA.',
        });
      }
      const sessionId = String(req.query.session ?? '');
      const state = await readSession(sessionId);
      if (!state.ok) return backToPage(res, sessionId, state.reason);

      // The box on the page is ticked by default, so anything but an explicit
      // refusal is read as consent to the optional linked roles step.
      const roles = req.query.roles !== '0' && req.query.roles !== 'false' && req.query.roles !== undefined;
      const scope = roles ? 'identify role_connections.write' : 'identify';

      const params = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri(),
        scope,
        // Consent every time, because the person is being told on our page
        // what they are about to grant and the two screens should agree.
        prompt: 'consent',
        state: jwt.sign({ session: sessionId, roles }, process.env.JWT_SECRET || 'dev_secret',
          { expiresIn: '15m' }),
      });
      res.redirect(`${DISCORD_AUTHORIZE}?${params.toString()}`);
    } catch (err) { next(err); }
  });

  routes.get('/discord/callback', requireAuth, async (req, res, next) => {
    try {
      if (!configured()) {
        return res.status(503).json({
          error: 'Discord linking is not configured on this deployment of VIA.',
        });
      }

      let carried;
      try {
        carried = jwt.verify(String(req.query.state ?? ''), process.env.JWT_SECRET || 'dev_secret');
      } catch {
        // A state we did not sign says nothing about which session was meant,
        // so there is no page to send the person back to except the general one.
        return backToPage(res, null, 'state');
      }

      // Discord sends the person back with an error rather than a code when
      // they pressed cancel, which is a decision rather than a failure.
      if (req.query.error) return backToPage(res, carried.session, 'declined');

      const state = await readSession(carried.session);
      if (!state.ok) return backToPage(res, carried.session, state.reason);

      const granted = await exchangeCode(reach, String(req.query.code ?? ''), redirectUri());
      if (!granted) return backToPage(res, carried.session, 'discord');

      const identity = await discordIdentity(reach, granted.access_token);
      if (!identity) return backToPage(res, carried.session, 'discord');

      // The whole point of the session: the account that asked to link and the
      // account that authorized have to be the same account.
      if (identity.id !== state.session.discordUserId) {
        return backToPage(res, carried.session, 'mismatch');
      }

      const wantsRoles = carried.roles === true
        && String(granted.scope ?? '').includes('role_connections.write');
      const key = readKey();
      const authorization = wantsRoles && key && granted.refresh_token
        ? seal(granted.refresh_token, key)
        : null;

      await linkAccount({ discordUserId: identity.id, netId: req.user.net_id, authorization });
      await completeLinkSession(carried.session);

      if (authorization) {
        // Best effort. A person is linked whatever Discord does with the facts,
        // and the next membership change pushes them again.
        try {
          await pushFacts(req.user.net_id);
        } catch (err) {
          console.error(`pushing the linked role facts for ${req.user.net_id} failed:`, err.message);
        }
      }

      await recordLinkCompleted({ discordUserId: identity.id, netId: req.user.net_id });
      res.redirect(`${clientUrl()}/link/discord/${carried.session}/done`);
    } catch (err) { next(err); }
  });

  return routes;
}

export default router;
