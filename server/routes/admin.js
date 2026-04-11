import { Router } from 'express';
import { requireAuth, requireGlobalAdmin } from '../middleware/auth.js';
import { listUsers, createUser, updateUser, resetPassword, deleteUser } from '../controllers/admin.js';

const router = Router();

router.use(requireAuth, requireGlobalAdmin);

router.get('/users',                 listUsers);
router.post('/users',                createUser);
router.put('/users/:netId',          updateUser);
router.put('/users/:netId/password', resetPassword);
router.delete('/users/:netId',       deleteUser);

export default router;
