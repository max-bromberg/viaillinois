import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { recommend } from '../services/intelligentScheduler.js';
import { WEEKDAYS } from '../lib/recurrence.js';
import { currentTerm } from '../lib/academicCalendar.js';

const router = Router();

/** Every other week is the far end of what the form offers. */
const MAX_INTERVAL_WEEKS = 8;

/**
 * Read the repeat a search is for.
 *
 * A repeat that names no end runs to the end of instruction, which is the
 * answer a board is asking for when they ask which evening works for the term.
 *
 * @returns {{ recurrence: object|null } | { error: string }}
 */
function readRecurrence(body) {
  const asked = body.recurrence;
  if (!asked) return { recurrence: null };

  const daysOfWeek = Array.isArray(asked.daysOfWeek) ? asked.daysOfWeek : [];
  if (daysOfWeek.some(day => !WEEKDAYS.includes(day))) {
    return { error: `A day of the week has to be one of ${WEEKDAYS.join(', ')}.` };
  }

  const intervalWeeks = Number(asked.intervalWeeks ?? 1);
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > MAX_INTERVAL_WEEKS) {
    return { error: `The interval has to be a whole number of weeks, from 1 to ${MAX_INTERVAL_WEEKS}.` };
  }

  const until = asked.until ?? currentTerm().instructionEnd;
  if (until < body.dateRange.start) {
    return { error: 'The repeat cannot end before the search begins.' };
  }

  return { recurrence: { intervalWeeks, daysOfWeek, until } };
}

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

    const repeat = readRecurrence(req.body);
    if (repeat.error) return res.status(400).json({ error: repeat.error });

    const result = await recommend({
      durationMinutes: parseInt(durationMinutes),
      dateRange,
      timeConstraint,
      dayConstraints,
      venueConstraints,
      excludedRooms,
      targetCourses,
      midtermSensitivity,
      recurrence: repeat.recurrence,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
