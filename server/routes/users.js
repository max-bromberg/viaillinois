import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getMe, unlinkDiscord } from '../controllers/users.js';

const router = Router();
router.get('/me', requireAuth, getMe);
router.delete('/me/discord', requireAuth, unlinkDiscord);
export default router;
