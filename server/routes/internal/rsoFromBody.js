import { sendApiError, ERROR_CODES } from '../../lib/apiError.js';

/**
 * The RSO the body names, put where requireRSOAdmin and requireRSOEditor look
 * for it.
 *
 * Those middlewares read the identifier from the path, because every route
 * that uses them on the website has the RSO in the path. Several internal
 * endpoints have it in the body instead, and the identifier is validated here
 * before it is put in front of the middleware, so the middleware itself is
 * unchanged and behaves the same everywhere else.
 *
 * @type {import('express').RequestHandler}
 */
export function rsoFromBody(req, res, next) {
  const rsoId = req.body?.rso_id;
  if (!Number.isInteger(rsoId) || rsoId < 1) {
    return sendApiError(res, 400, ERROR_CODES.INVALID,
      'rso_id has to be the whole number that identifies the organization.');
  }
  req.params.rsoId = String(rsoId);
  next();
}
