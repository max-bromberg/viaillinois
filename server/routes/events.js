import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listEvents, getEvent, createEvent, updateEvent, deleteEvent, rsvpEvent } from '../controllers/events.js';

const router = Router();

router.get('/',        listEvents);
router.get('/:id',     getEvent);
router.post('/',       requireAuth, createEvent);
router.put('/:id',     requireAuth, updateEvent);
router.delete('/:id',  requireAuth, deleteEvent);
router.post('/:id/rsvp', requireAuth, rsvpEvent);

export default router;
