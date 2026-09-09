import { Router } from 'express';
import { requireAuth, attachUser } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { createBugReport, listBugReports, updateBugReportStatus } from '../controllers/bugReports.js';

const router = Router();

/**
 * Reporting is open, so it is bounded. Generous enough that somebody who found
 * three things wrong in one sitting can say so, and small enough that the table
 * cannot be filled from one address.
 */
const reportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

// The reporter's NetID is recorded when they happen to be signed in, and the
// report is taken either way, so who is looking is read without being required.
router.post('/',      reportLimiter, attachUser, createBugReport);
router.get('/',       requireAuth, listBugReports);
router.patch('/:id',  requireAuth, updateBugReportStatus);

export default router;
