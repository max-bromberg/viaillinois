import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listMidterms, createMidterm, voteMidterm,
  getConfirmedMidtermsHandler, getAdminMidterms, updateMidtermStatus,
  getCourses,
} from '../controllers/midterms.js';

const router = Router();
router.get('/courses',      getCourses);
router.get('/confirmed',    getConfirmedMidtermsHandler);
router.get('/admin',        requireAuth, getAdminMidterms);
router.get('/',             listMidterms);
router.post('/',            requireAuth, createMidterm);
router.patch('/:id/status', requireAuth, updateMidtermStatus);
router.post('/:id/vote',    requireAuth, voteMidterm);
export default router;
