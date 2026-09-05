import { Router } from 'express';
import { requireRSOAdmin } from '../../middleware/auth.js';
import { sendApiError, ERROR_CODES, withErrorCode } from '../../lib/apiError.js';
import { getRso } from '../../db/queries/internalReads.ts';
import { unlinkByDiscordUserId } from '../../services/accountLinking.js';
import { openLinkSession, getLinkWithMemberships } from '../../db/queries/discordLinks.ts';
import { rsoFromBody } from './rsoFromBody.js';

/**
 * Linking, unlinking, and the question the bot asks about who somebody is.
 *
 * The bot never asserts that a Discord account belongs to a NetID. It opens a
 * session for the account it observed and hands the person an address on the
 * website, where they sign in as themselves. Everything here either opens that
 * handshake, reads its result, or takes it back.
 *
 * The confirmation of a server binding is here rather than with the reading
 * endpoints because it is about identity as well: what it answers is whether
 * the person asking may speak for that organization, decided by the same
 * middleware the dashboard applies.
 */

/** A Discord snowflake is a decimal string, and never a JavaScript number. */
const SNOWFLAKE = /^\d{1,32}$/;

function snowflake(value) {
  return typeof value === 'string' && SNOWFLAKE.test(value) ? value : null;
}

/** Where the person is sent to finish the link. */
function linkAddress(sessionId) {
  const base = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${base.replace(/\/+$/, '')}/link/discord/${sessionId}`;
}

export function createLinksRouter() {
  const router = Router();

  router.post('/links/sessions', async (req, res, next) => {
    try {
      const discordUserId = snowflake(req.body?.discord_user_id);
      if (!discordUserId) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'discord_user_id has to be a Discord user identifier, written as the string of digits Discord uses.');
      }
      const { sessionId, expiresAt } = await openLinkSession({ discordUserId });
      res.status(201).json({
        session_id: sessionId,
        address: linkAddress(sessionId),
        expires_at: expiresAt,
      });
    } catch (err) { next(err); }
  });

  router.get('/links/:discordUserId', async (req, res, next) => {
    try {
      const discordUserId = snowflake(req.params.discordUserId);
      if (!discordUserId) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'That is not a Discord user identifier.');
      }
      const link = await getLinkWithMemberships(discordUserId);
      if (!link) {
        return sendApiError(res, 404, ERROR_CODES.NOT_FOUND,
          'This Discord account is not linked to a VIA account.');
      }
      res.json(link);
    } catch (err) { next(err); }
  });

  router.delete('/links/:discordUserId', async (req, res, next) => {
    try {
      const discordUserId = snowflake(req.params.discordUserId);
      if (!discordUserId) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'That is not a Discord user identifier.');
      }
      const removed = await unlinkByDiscordUserId(discordUserId);
      if (!removed) {
        return sendApiError(res, 404, ERROR_CODES.NOT_FOUND,
          'This Discord account is not linked to a VIA account.');
      }
      res.status(204).end();
    } catch (err) { next(err); }
  });

  router.post('/guilds/bindings/confirm',
    rsoFromBody,
    withErrorCode(requireRSOAdmin),
    async (req, res, next) => {
      try {
        const rsoId = Number(req.params.rsoId);
        const rso = await getRso(rsoId);
        if (!rso) {
          return sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'There is no organization with that identifier.');
        }
        res.json({ ok: true, rso: { rso_id: rso.rso_id, name: rso.name } });
      } catch (err) { next(err); }
    });

  return router;
}
