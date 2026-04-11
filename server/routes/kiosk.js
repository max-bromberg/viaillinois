import { Router } from 'express';
import { getKioskEvents } from '../db/queries/events.js';

const router = Router();

router.get('/events', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const events = await getKioskEvents(limit);
    res.json({ events });
  } catch (err) { next(err); }
});

export default router;
