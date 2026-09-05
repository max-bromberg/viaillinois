import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { sendApiError, ERROR_CODES, withErrorCode } from '../../lib/apiError.js';
import { rotateCalendar, setCalendarRsos } from '../../db/queries/personalCalendars.ts';
import { newCalendarToken, calendarAddress, hashCalendarToken } from '../../lib/personalCalendarToken.js';

/**
 * The calendar a person subscribes to from their phone.
 *
 * The bot asks for the address on the person's behalf and sends it to them in
 * a direct message, and it asks again whenever they change which RSOs they
 * follow. Asking for the address a second time is asking for a new one: the
 * old address stops working the moment the new hash is stored, which is what a
 * person needs when they have shared it by accident.
 */

/** As many RSOs as anybody could follow, which makes this a guard rather than a limit. */
const MAX_RSO_SET = 200;

/**
 * The RSOs a request says the calendar follows.
 *
 * Null is every RSO, which is what somebody who has not chosen means, and an
 * empty list is the same thing said differently rather than a calendar with
 * nothing in it, because a subscription that answers nothing is not worth
 * making.
 *
 * @returns {{ rsoIds?: number[]|null, error?: string }}
 */
function readRsoSet(body) {
  const asked = body?.rso_ids;
  if (asked === null || asked === undefined) return { rsoIds: null };
  if (!Array.isArray(asked) || asked.length > MAX_RSO_SET) {
    return {
      error: `rso_ids has to be null for every organization, or a list of at most ${MAX_RSO_SET} identifiers.`,
    };
  }
  if (asked.some(id => !Number.isInteger(id) || id < 1)) {
    return { error: 'Every entry in rso_ids has to be the whole number that identifies an organization.' };
  }
  return { rsoIds: asked.length ? asked : null };
}

export function createCalendarsRouter() {
  const router = Router();

  router.post('/calendars/personal', withErrorCode(requireAuth), async (req, res, next) => {
    try {
      const set = readRsoSet(req.body);
      if (set.error) return sendApiError(res, 400, ERROR_CODES.INVALID, set.error);

      const token = newCalendarToken();
      const { rotatedAt } = await rotateCalendar({
        netId: req.user.net_id, tokenHash: hashCalendarToken(token), rsoIds: set.rsoIds,
      });
      res.json({ address: calendarAddress(token), rotated_at: rotatedAt });
    } catch (err) { next(err); }
  });

  router.put('/calendars/personal/rsos', withErrorCode(requireAuth), async (req, res, next) => {
    try {
      const set = readRsoSet(req.body);
      if (set.error) return sendApiError(res, 400, ERROR_CODES.INVALID, set.error);

      const changed = await setCalendarRsos({ netId: req.user.net_id, rsoIds: set.rsoIds });
      if (!changed) {
        return sendApiError(res, 404, ERROR_CODES.NOT_FOUND,
          'This person has no calendar address yet. Ask for one first.');
      }
      res.json({ ok: true, rso_ids: set.rsoIds });
    } catch (err) { next(err); }
  });

  return router;
}
