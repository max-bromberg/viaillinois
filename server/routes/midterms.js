import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { importMidterms } from '../controllers/calendarImport.js';
import {
  listMidterms, createMidterm, deleteMidterm,
  getConfirmedMidtermsHandler, getAdminMidterms, updateMidtermStatus, deleteMidterms,
  getCourses,
} from '../controllers/midterms.js';

const router = Router();

// The same bound as the event importer, and for the same reason.
const importLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.get('/courses',      getCourses);
router.get('/confirmed',    getConfirmedMidtermsHandler);
router.get('/admin',        requireAuth, getAdminMidterms);
router.get('/',             listMidterms);
router.post('/',            requireAuth, createMidterm);
router.post('/import',      importLimiter, requireAuth, importMidterms);
router.patch('/:id/status', requireAuth, updateMidtermStatus);
// Ahead of the one that reads an identifier out of the path, which would
// otherwise never be reached with an empty path segment anyway, and stated in
// this order so that reading the table says which is which.
router.delete('/',          requireAuth, deleteMidterms);
router.delete('/:id',       requireAuth, deleteMidterm);
export default router;
