import { Router } from 'express';
import { requireAuth, requireRSOAdmin, requireGlobalAdmin } from '../middleware/auth.js';
import { listRsos, getRso, createRso, updateRso, addMember, removeMember } from '../controllers/rsos.js';

const router = Router();

router.get('/',                            listRsos);
router.get('/:id',                         getRso);
router.post('/',            requireAuth, requireGlobalAdmin, createRso);
router.put('/:id',          requireRSOAdmin, updateRso);
router.post('/:id/members', requireRSOAdmin, addMember);
router.delete('/:id/members/:netId', requireRSOAdmin, removeMember);

export default router;
