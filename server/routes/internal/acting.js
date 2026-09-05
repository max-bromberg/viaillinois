import { createHash } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireRSOEditor } from '../../middleware/auth.js';
import { sendApiError, ERROR_CODES, codeForStatus, withErrorCode } from '../../lib/apiError.js';
import { presentEvent } from '../../lib/eventShape.js';
import { maySeeEvent } from '../../lib/eventVisibility.js';
import { identifier, isSnowflake } from '../../lib/identifiers.js';
import { toWallClock } from '../../lib/recurrence.js';
import { updateEvent, cancelEvent, restoreEvent, createEventSeries } from '../../controllers/events.js';
import { recommendSchedule } from '../scheduler.js';
import { getEventById } from '../../db/queries/events.js';
import { setInterest, clearInterest, countInterest } from '../../db/queries/eventInterest.ts';
import { saveFeedback } from '../../db/queries/eventFeedback.ts';
import { rsoFromBody } from './rsoFromBody.js';

/**
 * Everything the Discord bot does for a person.
 *
 * Not one of these endpoints decides anything for itself. Each runs the same
 * controller the dashboard's own route runs, so that a board member who
 * postpones a meeting from Discord and one who postpones it from the website
 * get the same checks, the same refusals and the same outbox entry. What is
 * written here is only the adapting: reading the request in the shape the bot
 * sends, putting it in front of the controller in the shape the controller
 * reads, and giving every refusal the machine readable code the bot chooses
 * its wording from.
 *
 * The two exceptions are interest and feedback, which have no controller on
 * the website yet because they arrived with the bot. They are written here in
 * full, with Drizzle, and the website will call the same queries when it grows
 * its own controls for them.
 */

/** The width of the reason a postponement can carry into the outbox entry. */
const REASON_MAX = 500;

/** The width of a comment box, which is a paragraph rather than an essay. */
const COMMENT_MAX = 1000;

/** Where interest can be recorded from. The web control is not built yet. */
const INTEREST_SOURCES = ['discord_event', 'discord_button', 'web'];

/**
 * The fields a request from Discord may change on an event, and what each one
 * has to be.
 *
 * Everything else about an event is a decision with a room and a time in it,
 * which belongs on the dashboard where the conflicts can be shown. The types
 * are checked here rather than left to the column, because a value the column
 * cannot hold reaches the driver as a failed statement and comes back to the
 * bot as a server error instead of as a sentence.
 */
const PATCHABLE = {
  description:   value => value === null || typeof value === 'string',
  is_private:    value => typeof value === 'boolean',
  location_note: value => value === null || typeof value === 'string',
};

/**
 * Run one of the website's controllers as the answer to an internal request.
 *
 * A refusal is passed on as it was written, with the code for its status
 * beside it. What the controller answers on success is the dashboard's shape,
 * which is not always the bot's, so a translation may replace it.
 *
 * @param {import('express').RequestHandler} controller
 * @param {(req: object) => Promise<object>} [translate] what to answer instead
 */
function delegate(controller, translate = null) {
  return function delegated(req, res, next) {
    const json = res.json.bind(res);
    res.json = body => {
      res.json = json;
      if (body && typeof body === 'object' && typeof body.error === 'string' && body.code === undefined) {
        return json({ ...body, code: codeForStatus(res.statusCode) });
      }
      if (!translate) return json(body);
      return Promise.resolve(translate(req)).then(json).catch(next);
    };
    return controller(req, res, next);
  };
}

/**
 * The scope of a change, put where the controller reads it.
 *
 * A change from Discord is always to the one event the bot named, never to a
 * whole repeat, because a Discord message is about one occurrence. req.query
 * is a getter that builds a fresh object on every read, so the value is
 * defined onto the request rather than assigned into what the getter returned.
 */
function scopedToOneEvent(req) {
  Object.defineProperty(req, 'query', {
    value: { ...req.query, scope: 'one' },
    configurable: true, enumerable: true, writable: true,
  });
}

/**
 * The event the request named, or the refusal that says it is not there.
 *
 * Read before the controller runs, because the controller writes every column
 * it is given and the bot sends only the few it means to change. What the rest
 * of the event holds has to be read to be handed back unchanged.
 *
 * @param {{ visibleOnly?: boolean }} [options] whether an internal event the
 *   acting person may not see is answered as though it were not there, which
 *   is what interest and feedback need because they are open to people who
 *   are not on any board
 */
async function readEvent(req, res, { visibleOnly = false } = {}) {
  const eventId = identifier(req.params.id);
  if (eventId === null) {
    sendApiError(res, 400, ERROR_CODES.INVALID, 'An event identifier has to be a whole number.');
    return null;
  }
  const event = await getEventById(eventId);
  if (!event) {
    sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'There is no event with that identifier.');
    return null;
  }
  if (visibleOnly && !(await maySeeEvent(req, event))) {
    // The same answer as an event that does not exist, on purpose. A refusal
    // that said "you may not see this one" would say that it exists.
    sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'There is no event with that identifier.');
    return null;
  }
  return event;
}

/** The event as it now stands, in the shape the reading endpoints answer with. */
async function eventAnswer(eventId) {
  const event = await getEventById(eventId);
  return { ok: true, event: event ? presentEvent(event) : null };
}

/** Everything the update controller writes, taken from the event as it stands. */
function unchangedFields(event) {
  return {
    title:         event.title,
    description:   event.description ?? null,
    start_time:    String(event.start_time),
    end_time:      String(event.end_time),
    is_private:    Boolean(event.is_private),
    location_id:   event.location_id ?? null,
    location_text: event.location_text ?? null,
  };
}

/**
 * A time the bot sent, as the database writes one, or null.
 *
 * The bot posts what a Discord modal holds, which is the same shape the event
 * form posts, so the same reader is used here as in the series editing path.
 */
function wallClock(raw) {
  return typeof raw === 'string' && raw.trim() ? toWallClock(raw.trim()) : null;
}

/**
 * The subject interest is recorded under for somebody who has not linked.
 *
 * A Discord identifier is not stored in the clear, because the interest table
 * would otherwise be a list of who goes to which meeting, keyed by an account
 * name anybody in a server can see. The salt is what stops the same list being
 * rebuilt by hashing every identifier in a server, so a deployment without one
 * records nothing rather than hashing with nothing.
 *
 * @returns {string|null} null when there is no salt to hash with
 */
function hashedSubject(discordUserId) {
  const salt = process.env.DISCORD_INTEREST_SALT;
  if (!salt) {
    console.warn(
      'DISCORD_INTEREST_SALT is not set, so interest from somebody who has not linked cannot be recorded. '
      + 'Set it in the environment and restart to record it.'
    );
    return null;
  }
  // Base64 rather than hexadecimal because the subject column holds sixty four
  // characters and a hexadecimal digest plus its prefix would not fit.
  return `h:${createHash('sha256').update(`${salt}:${discordUserId}`).digest('base64url')}`;
}

export function createActingRouter() {
  const router = Router();

  /**
   * A meeting moved. The times are the whole of the change, and the reason,
   * where the board gave one, travels with the entry so the bot can say why
   * rather than only that.
   */
  router.post('/events/:id/postpone', withErrorCode(requireAuth), async (req, res, next) => {
    try {
      const event = await readEvent(req, res);
      if (!event) return;

      const start = wallClock(req.body?.start_time);
      const end = wallClock(req.body?.end_time);
      if (!start || !end) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'A postponement needs a start time and an end time, each written as a date and a time.');
      }
      if (end <= start) {
        return sendApiError(res, 400, ERROR_CODES.INVALID, 'The end time has to come after the start time.');
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (reason.length > REASON_MAX) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          `The reason has to be ${REASON_MAX} characters or fewer.`);
      }

      req.body = { ...unchangedFields(event), start_time: start, end_time: end };
      if (reason) req.body.reason = reason;
      scopedToOneEvent(req);
      return delegate(updateEvent, () => eventAnswer(event.event_id))(req, res, next);
    } catch (err) { next(err); }
  });

  router.post('/events/:id/cancel', withErrorCode(requireAuth), delegate(cancelEvent));
  router.post('/events/:id/restore', withErrorCode(requireAuth), delegate(restoreEvent));

  /**
   * The small edits a board makes from a phone: what the event says, whether
   * it is internal, and the note at the door.
   */
  router.patch('/events/:id', withErrorCode(requireAuth), async (req, res, next) => {
    try {
      const fields = Object.keys(PATCHABLE);
      const asked = Object.keys(req.body ?? {});
      if (asked.some(field => !fields.includes(field))) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          `This endpoint changes only ${fields.join(', ')}. Use the dashboard for the rest.`);
      }
      if (asked.length === 0) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          `Name at least one of ${fields.join(', ')} to change.`);
      }
      const wrong = asked.find(field => !PATCHABLE[field](req.body[field]));
      if (wrong) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          wrong === 'is_private'
            ? 'is_private has to be true or false.'
            : `${wrong} has to be text, or null to clear it.`);
      }
      const event = await readEvent(req, res);
      if (!event) return;

      const changes = { ...unchangedFields(event) };
      if ('description' in req.body) changes.description = req.body.description;
      if ('is_private' in req.body) changes.is_private = req.body.is_private;
      // The note is read by the controller only when the key is there, and
      // leaving it out is how a request says it means to leave the note alone.
      if ('location_note' in req.body) changes.location_note = req.body.location_note;

      req.body = changes;
      scopedToOneEvent(req);
      return delegate(updateEvent, () => eventAnswer(event.event_id))(req, res, next);
    } catch (err) { next(err); }
  });

  /**
   * The same search the dashboard runs, for a board member of the RSO the body
   * names. There is no event yet, so there is nothing else to be an editor of.
   */
  router.post('/scheduler/recommend',
    rsoFromBody, withErrorCode(requireRSOEditor), withErrorCode(recommendSchedule));

  /** A repeat, created by the same controller the dashboard's form posts to. */
  router.post('/events/series', withErrorCode(requireAuth), delegate(createEventSeries));

  /**
   * Who means to go.
   *
   * A linked person is counted under their NetID, so the same person pressing
   * the button in two servers is one person. Anybody else is counted under a
   * salted hash of the Discord account the bot saw, which is never answered
   * back and never stored in the clear.
   */
  router.put('/events/:id/interest', async (req, res, next) => {
    try {
      const event = await readEvent(req, res, { visibleOnly: true });
      if (!event) return;

      const interested = req.body?.interested;
      if (typeof interested !== 'boolean') {
        return sendApiError(res, 400, ERROR_CODES.INVALID, 'interested has to be true or false.');
      }
      const source = req.body?.source ?? 'discord_button';
      if (!INTEREST_SOURCES.includes(source)) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          `source has to be one of: ${INTEREST_SOURCES.join(', ')}.`);
      }

      let subject = req.user?.net_id ?? null;
      if (!subject) {
        const discordUserId = req.body?.discord_user_id;
        if (!isSnowflake(discordUserId)) {
          return sendApiError(res, 400, ERROR_CODES.INVALID,
            'Interest needs either the acting person or the Discord user identifier it is for.');
        }
        subject = hashedSubject(discordUserId);
        if (!subject) {
          // Not busy, which would tell the bot to try again and have it try
          // for ever. This deployment cannot do this at all until somebody
          // changes its settings, so the sentence names the setting.
          return sendApiError(res, 500, ERROR_CODES.INVALID,
            'This deployment of VIA cannot record interest from somebody who has not linked their '
            + 'account, because DISCORD_INTEREST_SALT is not set on the web platform. Set it in the '
            + 'environment and restart.');
        }
      }

      if (interested) await setInterest({ eventId: event.event_id, subject, source });
      else await clearInterest({ eventId: event.event_id, subject });

      res.json({ ok: true, interest_count: await countInterest(event.event_id) });
    } catch (err) { next(err); }
  });

  /**
   * What somebody thought of an event they went to.
   *
   * Anybody signed in may say so, once per event, and saying it again replaces
   * what they said before. The board reads the average, the count and the
   * comments, and never who gave which rating.
   */
  router.post('/events/:id/feedback', withErrorCode(requireAuth), async (req, res, next) => {
    try {
      const rating = req.body?.rating;
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return sendApiError(res, 400, ERROR_CODES.INVALID, 'A rating has to be a whole number from one to five.');
      }
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
      if (comment.length > COMMENT_MAX) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          `A comment has to be ${COMMENT_MAX} characters or fewer.`);
      }
      const event = await readEvent(req, res, { visibleOnly: true });
      if (!event) return;

      await saveFeedback({
        eventId: event.event_id, netId: req.user.net_id, rating, comment: comment || null,
      });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  return router;
}
