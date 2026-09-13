import { Router } from 'express';
import { createProductionInternalGuard } from '../../middleware/internalGuard.js';
import { createActingUser } from '../../middleware/actingUser.js';
import { sendApiError, ERROR_CODES } from '../../lib/apiError.js';
import { createLinksRouter } from './links.js';
import { createReadingRouter } from './reading.js';
import { createOutboxRouter } from './outbox.js';
import { createActingRouter } from './acting.js';
import { createCalendarsRouter } from './calendars.js';

/**
 * The internal service API, served to the Discord bot on the private network.
 *
 * Everything under this prefix sits behind the guard and the acting
 * middleware, in that order: first prove the caller is the bot, then work out
 * who the bot is acting for, and nothing else here decides that. Every answer the guard let through carries the web
 * platform's version, so the bot's health endpoint can say which web platform
 * it is talking to, and a refusal from the guard carries nothing.
 * A path nothing matched is answered here, in the error shape, rather than
 * falling through to the HTML shell that serves the website.
 *
 * @param {{ version: string, onDenied: (denial: object) => void }} options
 */
export function createInternalRouter({ version, onDenied }) {
  const router = Router();

  router.use(createProductionInternalGuard({ onDenied }));
  // After the guard, so that a probe from somebody who is not the bot learns
  // nothing at all from its refusal, not even which version of the web
  // platform is running behind it.
  router.use((_req, res, next) => {
    res.set('X-Via-Internal-Api-Version', version);
    next();
  });
  // Whatever the cookie middleware made of a cookie that arrived with this
  // request is discarded here. The internal API has exactly one way of saying
  // who it acts for, which is the acting header resolved through the link
  // table, and a cookie reaching a route would be a second way, decided by
  // whoever could put a cookie on the request.
  router.use((req, _res, next) => { req.user = null; next(); });
  router.use(createActingUser());

  // Endpoints are mounted here, ahead of the fallthrough, as they are built.
  router.use(createLinksRouter());
  router.use(createReadingRouter());
  router.use(createOutboxRouter());
  router.use(createActingRouter());
  router.use(createCalendarsRouter());

  router.use((_req, res) => {
    sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'Not found.');
  });

  return router;
}
