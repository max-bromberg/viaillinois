import { Router } from 'express';
import { getKioskEvents } from '../db/queries/events.js';
import { readPaging, PAGING_LIMITS } from '../lib/pagination.js';
import { recordDenial } from '../services/denialRecorder.js';

const router = Router();

router.get('/events', async (req, res, next) => {
  try {
    // A lobby display asks for this over and over, so the ceiling here is
    // smaller than the feed's. It is not paginated, so only the limit matters.
    const { limit, refusal } = readPaging(req.query, PAGING_LIMITS.kiosk);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/kiosk/events',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    const events = await getKioskEvents(limit);
    res.json({ events });
  } catch (err) { next(err); }
});

export default router;
