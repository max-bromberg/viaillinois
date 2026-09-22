import { Router } from 'express';
import { sendApiError, ERROR_CODES } from '../../lib/apiError.js';
import { getRso } from '../../db/queries/internalReads.ts';
import { reportBinding, forgetBinding } from '../../db/queries/discordGuilds.ts';
import { replaceOptInsFor } from '../../db/queries/discordOptIns.ts';
import { snowflake } from '../../lib/identifiers.js';

/**
 * What the bot says about the Discord servers it is installed in.
 *
 * The binding between a server and an organization belongs to the bot. It is a
 * fact about a Discord server, the bot is what is installed there, and
 * Guild_Installations in via_bot is the record of it. The website has no
 * account on that database and is not meant to have one, so the board's own
 * dashboard would have nothing to show without the bot saying what it has.
 * These two endpoints are it saying so, and Rso_Discord_Guilds is where the
 * report lands.
 *
 * They run as the service rather than for a person. The board member who bound
 * the server was authorized at the moment they bound it, by the same
 * requireRSOAdmin the dashboard applies, through the confirmation endpoint in
 * links.js. This is the bot stating afterwards what came of that, in the same
 * way it states everything else it holds, so an acting person here would be a
 * second answer to a question already answered.
 *
 * The report is what the bot has rather than what changed, so both endpoints
 * are safe to call again with the same values. A binding reported twice is one
 * server, and a removal reported twice is the same nothing.
 */
export function createGuildsRouter() {
  const router = Router();

  router.put('/guilds/:guildId/binding', async (req, res, next) => {
    try {
      const guildId = snowflake(req.params.guildId);
      if (!guildId) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'The server identifier has to be a Discord server identifier, written as the string of digits Discord uses.');
      }

      const rsoId = req.body?.rso_id;
      if (!Number.isInteger(rsoId) || rsoId < 1) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'rso_id has to be the whole number that identifies the organization.');
      }

      // A binding to an organization VIA has no record of would be a row
      // pointing at nothing, and the dashboard that reads these rows belongs to
      // an organization that exists.
      const rso = await getRso(rsoId);
      if (!rso) {
        return sendApiError(res, 404, ERROR_CODES.NOT_FOUND,
          'There is no organization with that identifier.');
      }

      const guildName = req.body?.guild_name;
      const boundBy = snowflake(req.body?.bound_by);
      await reportBinding({
        guildId,
        rsoId,
        guildName: typeof guildName === 'string' ? guildName.slice(0, 200) : '',
        boundBy,
        boundAt: typeof req.body?.bound_at === 'string' ? req.body.bound_at : null,
      });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  router.delete('/guilds/:guildId/binding', async (req, res, next) => {
    try {
      const guildId = snowflake(req.params.guildId);
      if (!guildId) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'The server identifier has to be a Discord server identifier, written as the string of digits Discord uses.');
      }
      await forgetBinding(guildId);
      res.status(204).end();
    } catch (err) { next(err); }
  });

  /*
   * What one person asked to be told about, as the bot holds it.
   *
   * The same two choices can be made inside Discord, so the website's mirror
   * would drift if it only ever wrote what was chosen on the website. The bot
   * reports the whole of what it has for one account and the mirror is replaced
   * with it: a report that leaves something out is the bot saying it is no
   * longer followed, which a merge could never express.
   */
  router.put('/optins/:discordUserId', async (req, res, next) => {
    try {
      const discordUserId = snowflake(req.params.discordUserId);
      if (!discordUserId) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'The person identifier has to be a Discord user identifier, written as the string of digits Discord uses.');
      }

      const following = identifierList(req.body?.following);
      const reminders = identifierList(req.body?.reminders);
      if (!following || !reminders) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'following and reminders each have to be a list of the whole numbers that identify them.');
      }

      await replaceOptInsFor({ discordUserId, following, reminders });
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}

/** A list of identifiers, or null where the value is not one. */
function identifierList(value) {
  if (!Array.isArray(value)) return null;
  if (!value.every(entry => Number.isInteger(entry) && entry > 0)) return null;
  return value;
}
