import { Router } from 'express';
import { searchLocations } from '../db/queries/locations.js';

const router = Router();

router.get('/search', async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    if (!q.trim()) return res.json({ locations: [] });
    const locations = await searchLocations(q.trim(), 10);
    res.json({ locations });
  } catch (err) { next(err); }
});

export default router;
