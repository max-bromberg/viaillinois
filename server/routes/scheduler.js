import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { recommend } from '../services/intelligentScheduler.js';

const router = Router();

router.post('/recommend', requireAuth, async (req, res, next) => {
  try {
    const {
      durationMinutes = 60,
      dateRange,
      timeConstraint = null,
      dayConstraints = [],
      venueConstraints = { buildings: [], specificRoom: null },
      excludedRooms = [],
      targetCourses = [],
      midtermSensitivity = 'medium',
    } = req.body;

    if (!dateRange?.start || !dateRange?.end) {
      return res.status(400).json({ error: 'dateRange.start and dateRange.end are required' });
    }
    if (new Date(dateRange.start) >= new Date(dateRange.end)) {
      return res.status(400).json({ error: 'dateRange.start must be before dateRange.end' });
    }

    const result = await recommend({
      durationMinutes: parseInt(durationMinutes),
      dateRange,
      timeConstraint,
      dayConstraints,
      venueConstraints,
      excludedRooms,
      targetCourses,
      midtermSensitivity,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
