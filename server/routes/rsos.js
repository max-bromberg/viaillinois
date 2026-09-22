import { Router } from 'express';
import { requireAuth, requireRSOAdmin, requireRSOEditor, requireGlobalAdmin } from '../middleware/auth.js';
import { listRsos, getRso, createRso, updateRso, deleteRso, addMember, removeMember } from '../controllers/rsos.js';
import { getRsoStats } from '../controllers/rsoStats.js';
import { getRsoDiscord, unbindRsoDiscord } from '../controllers/rsoDiscord.js';

const router = Router();

router.get('/',                            listRsos);
// The statistics carry what people wrote about an organization's events and
// how many mean to come, which is the board's reading of its own work rather
// than anything a signed in stranger is owed.
router.get('/:id/stats',    requireRSOEditor, getRsoStats);
router.get('/:id',                         getRso);
router.post('/',            requireAuth, requireGlobalAdmin, createRso);
router.put('/:id',          requireRSOAdmin, updateRso);
router.delete('/:id',       requireAuth, requireGlobalAdmin, deleteRso);
router.post('/:id/members', requireRSOAdmin, addMember);
router.delete('/:id/members/:netId', requireRSOAdmin, removeMember);
// The board's own Discord server. What the website holds is a mirror of what
// the bot reported, and disconnecting is decided here and applied by the bot.
router.get('/:id/discord',              requireRSOAdmin, getRsoDiscord);
router.delete('/:id/discord/:guildId',  requireRSOAdmin, unbindRsoDiscord);

export default router;
