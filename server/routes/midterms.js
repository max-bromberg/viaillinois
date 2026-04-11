import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listMidterms, createMidterm, voteMidterm } from '../controllers/midterms.js';

const router = Router();
router.get('/',          listMidterms);
router.post('/',         requireAuth, createMidterm);
router.post('/:id/vote', requireAuth, voteMidterm);
export default router;
