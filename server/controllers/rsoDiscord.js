import { getGuildsForRso, getBinding, forgetBinding } from '../db/queries/discordGuilds.ts';
import { recordGuildUnbound } from '../db/queries/outbox.ts';
import { sendApiError, ERROR_CODES } from '../lib/apiError.js';
import { snowflake } from '../lib/identifiers.js';

/**
 * A board's own Discord server, as the dashboard shows it.
 *
 * The binding belongs to the bot, and what the website holds is a mirror of
 * what the bot last reported. So this answers what was reported rather than
 * asking Discord, and it can be a few seconds behind a board that has just
 * finished the setup command. What it is used for is telling a board their
 * server is connected and offering them the way to disconnect it, and both
 * survive being slightly out of date.
 *
 * Disconnecting is decided here, by the same requireRSOAdmin the rest of the
 * dashboard uses, and applied in two places: the mirror, so the board sees the
 * answer immediately, and the outbox, so the bot clears the binding where it
 * actually lives. The bot is the only thing that can make the change real, and
 * it is not asked synchronously, because a board should not be told their
 * request failed because the bot happened to be restarting.
 */

/**
 * Where a board sends somebody to put the bot in their server.
 *
 * The scopes are the two a slash command bot needs and nothing more: bot, to
 * be in the server at all, and applications.commands, to register the
 * commands. No permissions integer is asked for, because every permission the
 * bot needs in a channel is one the board grants that channel during setup,
 * and asking for a bundle at install time is how a bot ends up with more than
 * it uses.
 */
export function installUrl() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function getRsoDiscord(req, res, next) {
  try {
    const rsoId = Number(req.params.id);
    const guilds = await getGuildsForRso(rsoId);
    res.json({ guilds, install_url: installUrl() });
  } catch (err) { next(err); }
}

export async function unbindRsoDiscord(req, res, next) {
  try {
    const rsoId = Number(req.params.id);
    const guildId = snowflake(req.params.guildId);
    if (!guildId) {
      return sendApiError(res, 400, ERROR_CODES.INVALID,
        'The server identifier has to be a Discord server identifier, written as the string of digits Discord uses.');
    }

    /*
     * The mirror says which organization a server belongs to, and a board may
     * only disconnect its own. Without this check, somebody on one board could
     * name another organization's server in the path: requireRSOAdmin would
     * pass, because they really are on the board of the organization in the
     * path, and the bot would be handed an instruction to unbind a server
     * nobody asked it to. A server belonging to somebody else is answered the
     * same way as one that is not bound at all, so that the refusal does not
     * say whose it is.
     */
    const binding = await getBinding(guildId);
    if (!binding || binding.rso_id !== rsoId) {
      return sendApiError(res, 404, ERROR_CODES.NOT_FOUND,
        'No Discord server with that identifier is connected to this organization.');
    }

    await forgetBinding(guildId);
    await recordGuildUnbound({ guildId, rsoId });
    res.status(204).end();
  } catch (err) { next(err); }
}
