import { Router } from 'express';
import { currentTerm } from '../lib/academicCalendar.js';

const router = Router();

/**
 * The term the platform is in.
 *
 * The event form defaults a repeat to the end of instruction, the scheduler
 * searches to the same date, and the importer stops expanding an endless rule
 * there. All three read this, so all three agree.
 *
 * Public, because a term calendar is not private and every visitor's browser
 * would otherwise have to guess at it.
 */
router.get('/current', (_req, res) => {
  const term = currentTerm();
  res.json({
    semester: {
      code: term.code,
      label: term.label,
      instruction_start: term.instructionStart,
      instruction_end: term.instructionEnd,
      breaks: term.breaks,
    },
  });
});

export default router;
