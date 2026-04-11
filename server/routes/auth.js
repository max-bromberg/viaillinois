import { Router } from 'express';
import passport from 'passport';
import { signToken, attachUser, requireAuth } from '../middleware/auth.js';

const router = Router();

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
router.get('/microsoft',
  passport.authenticate('azuread-openidconnect', { session: false })
);

router.get('/microsoft/callback',
  passport.authenticate('azuread-openidconnect', { session: false, failureRedirect: '/login' }),
  (req, res) => {
    const token = signToken(req.user);
    res.cookie('via_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
  }
);

// ── Local fallback login ─────────────────────────────────────────────────────
router.post('/login',
  passport.authenticate('local', { session: false }),
  (req, res) => {
    const token = signToken(req.user);
    res.cookie('via_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ net_id: req.user.net_id, is_global_admin: req.user.is_global_admin });
  }
);

// ── Logout ───────────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, (_req, res) => {
  res.clearCookie('via_token');
  res.json({ ok: true });
});

export default router;
