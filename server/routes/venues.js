import { Router } from 'express';
import { searchLocations } from '../db/queries/locations.js';
import { readPaging, PAGING_LIMITS } from '../lib/pagination.js';
import { recordDenial } from '../services/denialRecorder.js';

const router = Router();

router.get('/search', async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    if (!q.trim()) return res.json({ locations: [] });
    // This search box ranks rooms in memory and returns the best matches, so
    // there is nothing to skip over. Only the limit applies.
    const { limit, refusal } = readPaging(req.query, PAGING_LIMITS.venues);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/venues',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    const locations = await searchLocations(q.trim(), limit);
    res.json({ locations });
  } catch (err) { next(err); }
});

export default router;
