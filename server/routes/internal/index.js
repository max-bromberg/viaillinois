import { Router } from 'express';
import { createProductionInternalGuard } from '../../middleware/internalGuard.js';
import { createActingUser } from '../../middleware/actingUser.js';
import { sendApiError, ERROR_CODES } from '../../lib/apiError.js';
import { createLinksRouter } from './links.js';
import { createReadingRouter } from './reading.js';
import { createOutboxRouter } from './outbox.js';

/**
 * The internal service API, served to the Discord bot on the private network.
 *
 * Everything under this prefix sits behind the guard and the acting
 * middleware, in that order: first prove the caller is the bot, then work out
 * who the bot is acting for. Every answer carries the web platform's version,
 * so the bot's health endpoint can say which web platform it is talking to.
 * A path nothing matched is answered here, in the error shape, rather than
 * falling through to the HTML shell that serves the website.
 *
 * @param {{ version: string, onDenied: (denial: object) => void }} options
 */
export function createInternalRouter({ version, onDenied }) {
  const router = Router();

  router.use((_req, res, next) => {
    res.set('X-Via-Internal-Api-Version', version);
    next();
  });
  router.use(createProductionInternalGuard({ onDenied }));
  router.use(createActingUser());

  // Endpoints are mounted here, ahead of the fallthrough, as they are built.
  router.use(createLinksRouter());
  router.use(createReadingRouter());
  router.use(createOutboxRouter());

  router.use((_req, res) => {
    sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'Not found.');
  });

  return router;
}
