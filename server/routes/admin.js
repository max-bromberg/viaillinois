import { Router } from 'express';
import { requireAuth, requireGlobalAdmin } from '../middleware/auth.js';
import {
  listUsers, createUser, updateUser, resetPassword, deleteUser,
  getPollStatus, getPollHistory, getUnknownCodes, triggerPoll, getDenials,
} from '../controllers/admin.js';

const router = Router();

router.use(requireAuth, requireGlobalAdmin);

router.get('/users',                 listUsers);
router.post('/users',                createUser);
router.put('/users/:netId',          updateUser);
router.put('/users/:netId/password', resetPassword);
router.delete('/users/:netId',       deleteUser);

router.get('/poll-status',            getPollStatus);
router.get('/poll-history/:service',  getPollHistory);
router.get('/poll-unknown-codes',     getUnknownCodes);
router.post('/poll-trigger/:service', triggerPoll);

router.get('/denials',                getDenials);

export default router;
