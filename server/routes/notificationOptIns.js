import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getMyNotifications, putOrganizationFollow, putEventReminder,
} from '../controllers/notificationOptIns.js';

/**
 * What a person asked to be told about, and the two ways they change it.
 *
 * Everything here is about the person asking and nobody else, so every route
 * is behind requireAuth and the answer is never anybody else's to keep. The
 * organization and the event in the path are the subject rather than the
 * authority: these are somebody's own choices about what reaches them, so
 * being on a board has nothing to do with it.
 */
const router = Router();

router.get('/notifications', requireAuth, getMyNotifications);
router.put('/notifications/organizations/:rsoId', requireAuth, putOrganizationFollow);
router.put('/notifications/events/:eventId', requireAuth, putEventReminder);

export default router;
