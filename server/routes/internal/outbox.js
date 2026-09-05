import { Router } from 'express';
import { sendApiError, ERROR_CODES } from '../../lib/apiError.js';
import { readPaging, PAGING_LIMITS } from '../../lib/pagination.js';
import { readOutbox } from '../../db/queries/outbox.ts';

/**
 * What changed, in the order it changed.
 *
 * The reader keeps the cursor and the web platform records nothing about what
 * has been read, which is what lets a second reader appear later without a
 * change here. next_after is the identifier of the last entry served, or the
 * cursor the request came with when there was nothing new, so a reader can
 * store what it is given either way and ask again from there.
 *
 * No acting person is needed. The outbox belongs to the service rather than to
 * anybody, and the guard on the prefix is what keeps it internal.
 */

/** A cursor from the query string, or null when the value is not a cursor. */
function cursor(raw) {
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

export function createOutboxRouter() {
  const router = Router();

  router.get('/outbox', async (req, res, next) => {
    try {
      const after = cursor(req.query.after);
      if (after === null) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'after has to be a whole number of zero or more, which is the identifier of the last entry you handled.');
      }
      const { limit, refusal } = readPaging(req.query, PAGING_LIMITS.outbox);
      if (refusal) return sendApiError(res, 400, ERROR_CODES.INVALID, refusal);

      const entries = await readOutbox({ after, limit });
      res.json({
        entries,
        next_after: entries.length ? entries[entries.length - 1].outbox_id : after,
      });
    } catch (err) { next(err); }
  });

  return router;
}
