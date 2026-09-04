import { sendApiError, ERROR_CODES } from '../lib/apiError.js';
import { getLinkByDiscordUserId } from '../db/queries/discordLinks.ts';

/**
 * Acting as a person, from Discord.
 *
 * The bot never asserts a NetID. It sends the Discord user identifier it
 * observed in an interaction, and this middleware turns that into the same
 * req.user that the cookie produces for the dashboard, by way of the link
 * table. From there requireAuth, requireRSOEditor, requireRSOAdmin and
 * requireGlobalAdmin apply unchanged, so the rules for what a person may do
 * from Discord are the rules for what they may do on the website, decided in
 * one place.
 *
 * A request with no acting header runs as the service itself, which can read
 * public data and the outbox and do nothing that needs a person.
 */

export const ACTING_HEADER = 'x-via-acting-discord-user';

/** A Discord snowflake is a decimal string. Anything else never reaches the database. */
const SNOWFLAKE = /^\d{1,32}$/;

/**
 * @param {{ resolveLink?: (discordUserId: string) => Promise<{ netId: string, isGlobalAdmin: number|boolean }|null> }} [options]
 * @returns {import('express').RequestHandler}
 */
export function createActingUser({ resolveLink = getLinkByDiscordUserId } = {}) {
  return async function actingUser(req, res, next) {
    const discordUserId = req.headers?.[ACTING_HEADER];
    if (discordUserId === undefined) return next();
    if (typeof discordUserId !== 'string' || !SNOWFLAKE.test(discordUserId)) {
      return sendApiError(res, 400, ERROR_CODES.INVALID, 'The acting Discord user identifier is not valid.');
    }
    try {
      const link = await resolveLink(discordUserId);
      if (!link) {
        return sendApiError(res, 403, ERROR_CODES.NOT_LINKED,
          'This Discord account is not linked to a VIA account.');
      }
      req.user = { net_id: link.netId, is_global_admin: Boolean(link.isGlobalAdmin) };
      next();
    } catch (err) {
      next(err);
    }
  };
}
