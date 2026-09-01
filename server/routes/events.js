import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { listEvents, getEvent, createEvent, updateEvent, deleteEvent, rsvpEvent, getEventRsvps } from '../controllers/events.js';
import { importEvents } from '../controllers/calendarImport.js';

const router = Router();

// Importing is the most expensive request the API accepts: it parses a file
// and can write a thousand rows. Bounded per address so one account cannot
// occupy the database with repeated large imports.
const importLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.get('/',              listEvents);
router.get('/:id/rsvps',    requireAuth, getEventRsvps);
router.get('/:id',          getEvent);
router.post('/',             requireAuth, createEvent);
router.post('/import',       importLimiter, requireAuth, importEvents);
router.put('/:id',          requireAuth, updateEvent);
router.delete('/:id',       requireAuth, deleteEvent);
router.post('/:id/rsvp',    requireAuth, rsvpEvent);

export default router;
