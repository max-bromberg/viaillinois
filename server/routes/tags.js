import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listTags, createTag, deleteTag } from '../controllers/tags.js';

const router = Router();

// Reading is open because the events feed's filter panel is open.
router.get('/',        listTags);
router.post('/',       requireAuth, createTag);
router.delete('/:name', requireAuth, deleteTag);

export default router;
