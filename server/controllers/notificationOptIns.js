import { getLinkByNetId } from '../db/queries/discordLinks.ts';
import {
  getFollowsFor, getRemindersFor, setFollow, setReminder,
} from '../db/queries/discordOptIns.ts';
import { getEventById } from '../db/queries/events.js';
import { recordOptInChanged } from '../db/queries/outbox.ts';
import { sendApiError, ERROR_CODES } from '../lib/apiError.js';

/**
 * Following an organization and asking for a reminder, from the website.
 *
 * Both of these belong to the bot, because the bot is what sends the message,
 * and both were reachable only by typing a command in Discord. Somebody signed
 * in here with a linked Discord account can now make the same two choices on
 * the page they are already reading, which is where they are when they decide.
 *
 * What the website holds is a mirror. A choice is written to it so the page
 * answers at once, and to the outbox so the bot applies it where it lives and
 * sends what was promised. The bot is not asked synchronously, because a
 * reader should not be told their choice failed because the bot happened to be
 * restarting, and the two writes are in that order so that a page never shows
 * a choice the bot was never told about.
 */

/** The Discord account a signed in person linked, or nothing where they have not. */
async function linkedAccount(req) {
  const link = await getLinkByNetId(req.user.net_id);
  return link?.discordUserId ?? null;
}

export async function getMyNotifications(req, res, next) {
  try {
    const discordUserId = await linkedAccount(req);
    if (!discordUserId) {
      // Not linked is an answer rather than a refusal. The page reads it to
      // decide whether to offer linking, which is the thing to do about it.
      return res.json({ linked: false, following: [], reminders: [] });
    }

    const [follows, reminders] = await Promise.all([
      getFollowsFor(discordUserId),
      getRemindersFor(discordUserId),
    ]);
    res.json({
      linked: true,
      following: follows.map(row => row.rso_id),
      reminders: reminders.map(row => row.event_id),
    });
  } catch (err) { next(err); }
}

/** Which way a control was moved, insisting the body says so rather than guessing. */
function choice(body, field) {
  const value = body?.[field];
  return typeof value === 'boolean' ? value : null;
}

export async function putOrganizationFollow(req, res, next) {
  try {
    const rsoId = Number(req.params.rsoId);
    const following = choice(req.body, 'following');
    if (following === null) {
      return sendApiError(res, 400, ERROR_CODES.INVALID,
        'following has to be true or false, which says whether you want to hear about this organization.');
    }

    const discordUserId = await linkedAccount(req);
    if (!discordUserId) {
      return sendApiError(res, 409, ERROR_CODES.INVALID,
        'Link your Discord account to VIA first, because that is where these messages are sent.');
    }

    await setFollow({ discordUserId, rsoId, following });
    await recordOptInChanged({
      discordUserId, subject: 'rso', subjectId: rsoId, wanted: following,
    });
    res.status(204).end();
  } catch (err) { next(err); }
}

export async function putEventReminder(req, res, next) {
  try {
    const eventId = Number(req.params.eventId);
    const wanted = choice(req.body, 'wanted');
    if (wanted === null) {
      return sendApiError(res, 400, ERROR_CODES.INVALID,
        'wanted has to be true or false, which says whether you want reminding about this event.');
    }

    const discordUserId = await linkedAccount(req);
    if (!discordUserId) {
      return sendApiError(res, 409, ERROR_CODES.INVALID,
        'Link your Discord account to VIA first, because that is where these messages are sent.');
    }

    /*
     * An internal event is shown to the organization's own members and to
     * nobody else, and a reminder about one would carry its title into a direct
     * message to whoever asked. Asking about an event VIA will not show is
     * refused in the same words as asking about one that is not there, so the
     * refusal does not confirm that an internal event exists.
     *
     * Withdrawing is allowed whatever the event has become, so that somebody
     * who asked for a reminder before an event was made internal is not stuck
     * with it.
     */
    if (wanted) {
      const event = await getEventById(eventId);
      if (!event || event.is_private) {
        return sendApiError(res, 404, ERROR_CODES.NOT_FOUND,
          'There is no event with that identifier.');
      }
    }

    await setReminder({ discordUserId, eventId, wanted });
    await recordOptInChanged({
      discordUserId, subject: 'event', subjectId: eventId, wanted,
    });
    res.status(204).end();
  } catch (err) { next(err); }
}
