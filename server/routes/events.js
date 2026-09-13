import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { listEvents, getEvent, createEvent, createEventSeries, updateEvent, deleteEvent, cancelEvent, restoreEvent } from '../controllers/events.js';
import { importEvents } from '../controllers/calendarImport.js';

const router = Router();

// Importing is the most expensive request the API accepts: it parses a file
// and can write a thousand rows. Bounded per address so one account cannot
// occupy the database with repeated large imports.
const importLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.get('/',              listEvents);
router.get('/:id',          getEvent);
router.post('/',             requireAuth, createEvent);
// Ahead of nothing that could shadow it: the only other POST paths are the
// collection itself and the importer.
router.post('/series',       requireAuth, createEventSeries);
router.post('/import',       importLimiter, requireAuth, importEvents);
router.put('/:id',          requireAuth, updateEvent);
// A state rather than a delete: the event keeps its page so people can be told.
router.post('/:id/cancel',  requireAuth, cancelEvent);
router.post('/:id/restore', requireAuth, restoreEvent);
router.delete('/:id',       requireAuth, deleteEvent);

export default router;
