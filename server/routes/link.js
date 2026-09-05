import { Router } from 'express';
import { getLinkSession } from '../db/queries/discordLinks.ts';
import { campusNow } from '../lib/timezone.js';

/**
 * What the link page asks before it draws anything.
 *
 * The address a person opens arrives in a Discord direct message, so it is
 * public in the sense that anybody holding it can open it. What this answers
 * is therefore only whether the session is still worth offering a button for.
 * It never says which Discord account opened the session, because a person who
 * was sent somebody else's address should learn nothing from opening it, and
 * the callback compares the account anyway.
 *
 * An identifier nobody opened is answered as unknown rather than refused, so
 * the page has one shape to draw for every case it cannot proceed with.
 */

const SESSION_ID = /^[A-Za-z0-9_-]{43}$/;

const router = Router();

router.get('/discord/:session', async (req, res, next) => {
  try {
    if (!SESSION_ID.test(String(req.params.session ?? ''))) return res.json({ status: 'unknown' });
    const session = await getLinkSession(req.params.session);
    if (!session) return res.json({ status: 'unknown' });
    if (session.completedAt) return res.json({ status: 'completed' });
    if (String(session.expiresAt) <= campusNow()) return res.json({ status: 'expired' });
    res.json({ status: 'open', expires_at: session.expiresAt });
  } catch (err) { next(err); }
});

export default router;
