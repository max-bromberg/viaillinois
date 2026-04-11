import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { recommend } from '../services/venueRecommender.js';

const router = Router();

router.post('/recommend', requireAuth, async (req, res, next) => {
  try {
    const { attendance, startTime, endTime, requiresAV = false } = req.body;
    if (!attendance || !startTime || !endTime) {
      return res.status(400).json({ error: 'attendance, startTime, endTime required' });
    }
    const venues = await recommend({ attendance: parseInt(attendance), startTime, endTime, requiresAV });
    res.json({ venues });
  } catch (err) { next(err); }
});

export default router;
