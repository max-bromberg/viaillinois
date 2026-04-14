import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { OIDCStrategy } from 'passport-azure-ad';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getUserByNetId, upsertUser, getLocalAccount } from '../db/queries/users.js';

// ── passport-local strategy ─────────────────────────────────────────────────
// Guard allows vitest mocks to skip strategy registration
if (typeof passport.use === 'function') {
  passport.use(new LocalStrategy(
    { usernameField: 'netId', passwordField: 'password' },
    async (netId, password, done) => {
      try {
        const account = await getLocalAccount(netId);
        if (!account) return done(null, false, { message: 'Unknown user' });
        const valid = await bcrypt.compare(password, account.password_hash);
        if (!valid) return done(null, false, { message: 'Wrong password' });
        return done(null, account);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

// ── passport-azure-ad OIDC strategy ─────────────────────────────────────────
// Only configure if Azure credentials are present (skipped in test env)
if (typeof passport.use === 'function' && process.env.AZURE_CLIENT_ID && process.env.AZURE_TENANT_ID) {
  passport.use(new OIDCStrategy(
    {
      identityMetadata: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0/.well-known/openid-configuration`,
      clientID:         process.env.AZURE_CLIENT_ID,
      clientSecret:     process.env.AZURE_CLIENT_SECRET,
      responseType:     'code',
      responseMode:     'query',
      redirectUrl:      `${process.env.SERVER_URL || 'http://localhost:3001'}/auth/microsoft/callback`,
      allowHttpForRedirectUrl: process.env.NODE_ENV !== 'production',
      scope:            ['openid', 'profile', 'email'],
    },
    async (_iss, _sub, profile, _accessToken, _refreshToken, done) => {
      try {
        const netId    = profile._json?.preferred_username?.split('@')[0] || profile.oid;
        const fullName = profile.displayName || '';
        const email    = profile._json?.email || profile._json?.preferred_username || '';
        await upsertUser({ net_id: netId, full_name: fullName, email });
        const user = await getUserByNetId(netId);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

// ── JWT helpers ──────────────────────────────────────────────────────────────
export function signToken(user) {
  return jwt.sign(
    { net_id: user.net_id, is_global_admin: user.is_global_admin },
    process.env.JWT_SECRET || 'dev_secret',
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
}

// ── Middleware ───────────────────────────────────────────────────────────────

/**
 * Attach req.user from JWT cookie. Public routes pass through — use requireAuth to gate.
 */
export function attachUser(req, _res, next) {
  try {
    const token = req.cookies?.via_token;
    if (token) req.user = verifyToken(token);
  } catch { /* invalid token — req.user stays null */ }
  next();
}

/** Require any authenticated user. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  next();
}

/** Require global admin flag on the user. */
export function requireGlobalAdmin(req, res, next) {
  if (!req.user?.is_global_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

/**
 * Require the user to be a Board member of the specified RSO.
 * Global admins bypass the RSO membership check entirely.
 * Reads rso_id from req.params.id when available; falls back to req.params.rsoId.
 */
export function requireRSOAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.is_global_admin) return next();
  const rsoId = parseInt(req.params.id || req.params.rsoId);
  if (!rsoId) return res.status(400).json({ error: 'RSO ID required' });
  checkRsoAdmin(req.user.net_id, rsoId)
    .then(ok => ok ? next() : res.status(403).json({ error: 'RSO board access required' }))
    .catch(next);
}

/**
 * Require the user to be a Board member or Editor of the specified RSO.
 * Used to gate event CRUD — Editors can manage events but not members/details.
 */
export function requireRSOEditor(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.is_global_admin) return next();
  const rsoId = parseInt(req.params.id || req.params.rsoId);
  if (!rsoId) return res.status(400).json({ error: 'RSO ID required' });
  checkRsoEditor(req.user.net_id, rsoId)
    .then(ok => ok ? next() : res.status(403).json({ error: 'RSO editor access required' }))
    .catch(next);
}

/**
 * Programmatic Board-only check (manage members, RSO details).
 * @param {string} netId
 * @param {number} rsoId
 * @returns {Promise<boolean>}
 */
export async function checkRsoAdmin(netId, rsoId) {
  const { getMembership } = await import('../db/queries/rso.js');
  try {
    const membership = await getMembership(netId, rsoId);
    return membership?.role === 'Board';
  } catch {
    return false;
  }
}

/**
 * Programmatic Board-or-Editor check (manage events).
 * @param {string} netId
 * @param {number} rsoId
 * @returns {Promise<boolean>}
 */
export async function checkRsoEditor(netId, rsoId) {
  const { getMembership } = await import('../db/queries/rso.js');
  try {
    const membership = await getMembership(netId, rsoId);
    return membership && ['Board', 'Editor'].includes(membership.role);
  } catch {
    return false;
  }
}

export { passport };
