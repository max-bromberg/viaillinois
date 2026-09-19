import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMe, unlinkDiscord } from '../controllers/users.js';

const router = Router();
/*
 * Who is looking, answered for everybody.
 *
 * Every visitor's first request is this one, because the page cannot read the
 * cookie holding the session: it is httpOnly, which is the point of it. Behind
 * requireAuth this answered 401 to anybody not signed in, and a browser writes
 * a failed request into the console whatever the page does about it, so every
 * anonymous reader and every crawler that renders the page met a red error on
 * the way in. Nobody signed in is an answer rather than a failure. What is
 * read and what is said about a person has not changed: attachUser has already
 * refused anything that is not a session token VIA signed.
 */
router.get('/me', getMe);
router.delete('/me/discord', requireAuth, unlinkDiscord);
export default router;
