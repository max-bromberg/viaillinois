import { campusNow } from '../lib/timezone.js';
import * as eventsDb from '../db/queries/events.js';
import * as rsoDb from '../db/queries/rso.js';
import * as advancedDb from '../db/queries/advanced.js';
import * as seriesDb from '../db/queries/eventSeries.js';
import { planSeries, splitByBusyRoom } from '../services/recurringEvents.js';
import { checkConflict } from '../services/conflictDetector.js';
import { timeOfDay, durationMinutes, addMinutes, toWallClock } from '../lib/recurrence.js';
import { readPaging, PAGING_LIMITS } from '../lib/pagination.js';
import { recordDenial } from '../services/denialRecorder.js';
import * as outbox from '../db/queries/outbox.ts';

import { checkRsoAdmin, checkRsoEditor } from '../middleware/auth.js';

/**
 * More RSOs than VIA will ever have, which is what makes this a guard against
 * a query built to be expensive rather than a limit anybody could meet. The
 * filter panel offers one checkbox per RSO, so a real reader sends at most the
 * number of RSOs there are.
 */
const MAX_RSO_FILTER = 200;
const RSO_IDS_REFUSED =
  'rsoIds must be a list of at most 200 whole numbers, separated by commas.';

/**
 * The RSOs a reader ticked, as numbers, or null when the value is not that.
 *
 * Accepts a comma separated list and a repeated parameter, because both are
 * ordinary ways to write a list in a query string and the panel should not
 * depend on which one the client happens to use.
 *
 * @param {unknown} raw
 * @returns {number[]|null} an empty list means no filter, which is what the
 *   panel means when nobody has ticked anything
 */
function readRsoIds(raw) {
  if (raw === undefined || raw === '') return [];
  const parts = (Array.isArray(raw) ? raw : [raw])
    .flatMap(value => (typeof value === 'string' ? value.split(',') : [value]))
    .map(value => String(value).trim())
    .filter(value => value !== '');
  if (parts.length > MAX_RSO_FILTER) return null;
  const ids = parts.map(Number);
  if (ids.some(id => !Number.isInteger(id) || id < 1)) return null;
  return ids;
}

export async function listEvents(req, res, next) {
  try {
    // The feed is a list of what is coming up, so a request that names no
    // timeframe gets today and later. Events that have already happened are
    // still served, under the archived timeframe, for anyone who asks for them,
    // and a view that spans the calendar, such as the month grid, asks for all.
    const { tags, startDate, endDate, keyword, timeframe = 'upcoming' } = req.query;
    if (!eventsDb.TIMEFRAMES.includes(timeframe)) {
      return res.status(400).json({ error: `timeframe must be one of: ${eventsDb.TIMEFRAMES.join(', ')}` });
    }
    // The feed's filter panel. Both of these used to be applied in the browser,
    // which meant the feed had to fetch every matching event before it could
    // draw one page of them, so the page a reader saw and the page the database
    // built were different things.
    const rsoIds = readRsoIds(req.query.rsoIds);
    if (rsoIds === null) {
      return res.status(400).json({ error: RSO_IDS_REFUSED });
    }
    const excludePrivate = req.query.excludePrivate === 'true';
    const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.events);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/events',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    const filters = {
      tags:      tags      ? (Array.isArray(tags) ? tags : [tags]) : [],
      startDate: startDate || null,
      endDate:   endDate   || null,
      keyword:   keyword   || null,
      timeframe,
      rsoIds,
      excludePrivate,
      limit,
      offset,
    };

    // Global admins and RSO board/admin members see all events (including private).
    // Everyone else sees only public events.
    let events, total;
    if (req.user?.is_global_admin) {
      [[{ total }], events] = await Promise.all([
        eventsDb.countAllEvents(filters),
        eventsDb.getAllEvents(filters),
      ]);
    } else if (req.user?.net_id) {
      const memberships = await rsoDb.getUserMemberships(req.user.net_id);
      const memberRsoIds = memberships.map(m => m.rso_id);
      [[{ total }], events] = await Promise.all([
        eventsDb.countVisibleEvents(filters, memberRsoIds),
        eventsDb.getVisibleEvents(filters, memberRsoIds),
      ]);
    } else {
      [[{ total }], events] = await Promise.all([
        eventsDb.countPublicEvents(filters),
        eventsDb.getPublicEvents(filters),
      ]);
    }

    res.json({ events, total });
  } catch (err) { next(err); }
}

export async function getEvent(req, res, next) {
  try {
    const event = await eventsDb.getEventById(parseInt(req.params.id));
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.is_private) {
      if (!req.user) return res.status(404).json({ error: 'Event not found' });
      if (!req.user.is_global_admin) {
        const memberships = await rsoDb.getUserMemberships(req.user.net_id);
        const canSee = memberships.some(m => m.rso_id === event.rso_id);
        if (!canSee) return res.status(404).json({ error: 'Event not found' });
      }
    }
    res.json({ event });
  } catch (err) { next(err); }
}

/**
 * Why an event moved, where whoever moved it said why.
 *
 * It is not a column on the event. It belongs to the change rather than to the
 * event, so it travels in the entry the Discord bot reads and is what the bot
 * puts in the message that tells people the meeting moved.
 *
 * @returns {string|null}
 */
function readReason(body) {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  return reason || null;
}

/**
 * A location is optional, and can be either a room VIA knows about or free
 * text. Empty free text is stored as nothing rather than as an empty string,
 * so that "no location" has one representation instead of two.
 */
function readLocation(body) {
  const text = typeof body.location_text === 'string' ? body.location_text.trim() : '';
  return {
    location_id: body.location_id ?? null,
    location_text: text || null,
  };
}

/** The width of Events.location_note. */
const LOCATION_NOTE_MAX = 500;

/**
 * The small thing a board changes at the door: the north entrance, the room
 * beside the one booked. Stored trimmed, an empty note is no note, and a
 * request that does not mention it leaves it alone.
 *
 * @returns {{ location_note?: string|null, error?: string }}
 */
function readLocationNote(body) {
  if (!('location_note' in body)) return {};
  const note = typeof body.location_note === 'string' ? body.location_note.trim() : '';
  if (note.length > LOCATION_NOTE_MAX) {
    return { error: `The location note has to be ${LOCATION_NOTE_MAX} characters or fewer.` };
  }
  return { location_note: note || null };
}

export async function createEvent(req, res, next) {
  try {
    const { rso_id, title, description, start_time, end_time, is_private = false, tags = [] } = req.body;
    if (!rso_id || !title || !start_time || !end_time) {
      return res.status(400).json({ error: 'rso_id, title, start_time, end_time required' });
    }
    const note = readLocationNote(req.body);
    if (note.error) return res.status(400).json({ error: note.error });
    const result = await advancedDb.createEventTransactional(
      {
        rso_id, created_by: req.user.net_id, ...readLocation(req.body), ...note,
        title, description, start_time, end_time, is_private,
      },
      tags,
      req.user.is_global_admin
    );
    if (result.conflict)     return res.status(409).json({ error: 'Location is already booked for this time' });
    if (result.unauthorized) return res.status(403).json({ error: 'RSO editor access required' });
    res.status(201).json({ event_id: result.eventId });
  } catch (err) { next(err); }
}

/**
 * Create a repeating event: the rule, and one event per occurrence.
 *
 * A term of weekly meetings is one request. Entering it as fifteen events is
 * what boards were doing instead, and it is why feeds went stale halfway
 * through a term.
 *
 * A week whose room is already taken is left out rather than failing the whole
 * series, and the response says which dates those were, so the board can see
 * what happened and book those weeks somewhere else. A repeat where every week
 * is taken is a conflict, and nothing is written.
 */
export async function createEventSeries(req, res, next) {
  try {
    const { rso_id, title, description, start_time, end_time, is_private = false, tags = [], recurrence = {} } = req.body;
    if (!rso_id || !title || !start_time || !end_time) {
      return res.status(400).json({ error: 'rso_id, title, start_time, end_time required' });
    }

    const rsoId = parseInt(rso_id);
    const permitted = req.user.is_global_admin || await checkRsoEditor(req.user.net_id, rsoId);
    if (!permitted) return res.status(403).json({ error: 'RSO editor access required' });

    const plan = planSeries({ startTime: start_time, endTime: end_time, recurrence });
    if (plan.error) return res.status(400).json({ error: plan.error });

    const { location_id, location_text } = readLocation(req.body);
    const note = readLocationNote(req.body);
    if (note.error) return res.status(400).json({ error: note.error });

    let occurrences = plan.occurrences;
    let skipped = [];
    if (location_id) {
      const busy = await seriesDb.busyInRoom(
        location_id, plan.occurrences[0].start, plan.occurrences.at(-1).end
      );
      ({ keep: occurrences, skipped } = splitByBusyRoom(plan.occurrences, busy));
      if (occurrences.length === 0) {
        return res.status(409).json({ error: 'Location is already booked for every date in this repeat' });
      }
    }

    const { seriesId, eventIds } = await seriesDb.createSeriesWithOccurrences({
      series: { ...plan.series, ends_on: occurrences.at(-1).date, rso_id: rsoId, created_by: req.user.net_id },
      occurrences,
      event: {
        rso_id: rsoId, created_by: req.user.net_id, location_id, location_text, ...note,
        title, description, is_private,
      },
      tagNames: tags,
    });

    res.status(201).json({
      series_id: seriesId,
      event_ids: eventIds,
      created: eventIds.length,
      skipped,
    });
  } catch (err) { next(err); }
}

/**
 * Whether an edit moved the event in time.
 *
 * The form posts what a browser date and time field holds, with a T where the
 * database writes a space and no seconds, so both sides are read as wall clock
 * readings before they are compared. A request that names no time at all has
 * moved nothing.
 *
 * @param {{ start_time: unknown, end_time: unknown }} event the event as it stands
 * @param {unknown} startTime what the request asks it to become
 * @param {unknown} endTime
 * @returns {boolean}
 */
function movedInTime(event, startTime, endTime) {
  const moved = (asked, stored) => {
    if (asked === undefined || asked === null || asked === '') return false;
    const wanted = toWallClock(asked);
    // A reading nothing can make sense of is refused further down rather than
    // treated as a move here.
    if (wanted === null) return false;
    return wanted !== toWallClock(stored);
  };
  return moved(startTime, event.start_time) || moved(endTime, event.end_time);
}

/**
 * How much of a series a change is meant to reach.
 *
 * An event that does not repeat has only itself, so every scope means the same
 * thing there and the request does not have to know whether it is editing one.
 */
const SCOPES = ['one', 'following', 'all'];

function readScope(req) {
  const scope = req.query.scope ?? 'one';
  return SCOPES.includes(scope) ? scope : null;
}

/**
 * The occurrences a scoped change covers, and the times they would move to.
 *
 * Each occurrence keeps its own date and takes the new hour and length, which
 * is what moving a weekly meeting from six to seven means.
 */
function projectOccurrences(occurrences, startOfDay, minutes) {
  return occurrences
    .filter(occurrence => !occurrence.detached)
    .map(occurrence => {
      const date = String(occurrence.start_time).slice(0, 10);
      if (!startOfDay || minutes == null) {
        return { date, start: String(occurrence.start_time), end: String(occurrence.end_time) };
      }
      const start = `${date} ${startOfDay}`;
      return { date, start, end: addMinutes(start, minutes) };
    });
}

export async function updateEvent(req, res, next) {
  try {
    const eventId = parseInt(req.params.id);
    const event = await eventsDb.getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const isAdmin = req.user.is_global_admin || await checkRsoEditor(req.user.net_id, event.rso_id);
    if (!isAdmin) return res.status(403).json({ error: 'RSO editor access required' });

    const scope = readScope(req);
    if (!scope) return res.status(400).json({ error: `scope must be one of: ${SCOPES.join(', ')}` });

    const { title, description, start_time, end_time, is_private, tags } = req.body;
    const { location_id, location_text } = readLocation(req.body);
    const note = readLocationNote(req.body);
    if (note.error) return res.status(400).json({ error: note.error });

    // One event, which is every event that does not repeat, and the one week an
    // organizer moved on its own.
    if (scope === 'one' || !event.series_id) {
      // Two events with no room cannot collide, so there is nothing to check.
      if (location_id && start_time && end_time) {
        const conflict = await checkConflict(location_id, start_time, end_time, eventId);
        if (conflict) return res.status(409).json({ error: 'Location is already booked for this time' });
      }
      await eventsDb.updateEvent(eventId, {
        location_id, location_text, title, description, start_time, end_time, is_private, ...note,
      });
      if (tags) await eventsDb.setEventTags(eventId, tags);
      // A week that was edited on its own stays where the organizer put it when
      // the rest of the series is edited later. That is a statement about the
      // week having moved, so it is made only when the week actually moved. A
      // change to the description, or to the note at the door, is not a move,
      // and detaching for one severed a week from its repeat every time a
      // board edited it from Discord.
      if (event.series_id && movedInTime(event, start_time, end_time)) {
        await seriesDb.detachEvent(eventId);
      }
      // The entry follows the change, because this path has no transaction to
      // join, and it names what changed by comparing the event as it stood
      // with the event as it now is.
      await outbox.recordEventUpdated(event, { reason: readReason(req.body) });
      return res.json({ ok: true, updated: 1 });
    }

    // The form posts what a browser date and time field holds, with a T where
    // the database writes a space and no seconds. A time that cannot be read
    // would move every week of the series to midnight, so it is refused here
    // rather than applied.
    const start = start_time ? toWallClock(start_time) : null;
    const end = end_time ? toWallClock(end_time) : null;
    if ((start_time && !start) || (end_time && !end)) {
      return res.status(400).json({ error: 'The start time and the end time each have to be a date and a time.' });
    }

    const from = scope === 'following' ? String(event.start_time) : null;
    const startOfDay = start ? timeOfDay(start) : null;
    const minutes = start && end ? durationMinutes(start, end) : null;

    const covered = await seriesDb.occurrencesOfSeries(event.series_id, { from });
    const projected = projectOccurrences(covered, startOfDay, minutes);

    // Moving a whole series into a room somebody else has booked cannot quietly
    // leave those weeks behind: the events already exist, so the answer is no,
    // with the weeks that are in the way named.
    if (location_id && projected.length > 0) {
      const busy = await seriesDb.busyInRoom(
        location_id, projected[0].start, projected.at(-1).end, { excludeSeriesId: event.series_id }
      );
      const { skipped } = splitByBusyRoom(projected, busy);
      if (skipped.length > 0) {
        return res.status(409).json({
          error: 'Location is already booked on some of these dates',
          conflicts: skipped,
        });
      }
    }

    const result = await seriesDb.applyToSeries(event.series_id, {
      from,
      fields: { title, description, location_id, location_text, is_private, ...note },
      startOfDay,
      durationMinutes: minutes,
    });

    const reached = covered.filter(occurrence => !occurrence.detached).map(occurrence => occurrence.event_id);
    if (tags) await seriesDb.setTagsForEvents(reached, tags);

    // One entry for the repeat rather than one per week, because a repeat is
    // one thing to the people reading about it. The event the request named is
    // one of the weeks the edit reached, so comparing it with itself afterwards
    // is what names the fields that changed.
    await outbox.recordSeriesUpdated(event.series_id, { affectedEventIds: reached, sample: event });

    res.json({ ok: true, updated: result.affectedRows });
  } catch (err) { next(err); }
}

export async function deleteEvent(req, res, next) {
  try {
    const eventId = parseInt(req.params.id);
    const event = await eventsDb.getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const isAdmin = await checkRsoEditor(req.user.net_id, event.rso_id);
    if (!isAdmin && !req.user.is_global_admin) return res.status(403).json({ error: 'RSO editor access required' });

    const scope = readScope(req);
    if (!scope) return res.status(400).json({ error: `scope must be one of: ${SCOPES.join(', ')}` });

    // What the entry has to say about a deletion cannot be read after it, so
    // the rule and the occurrences it covers are read first.
    if (scope === 'all' && event.series_id) {
      const series = await outbox.seriesSnapshot(event.series_id);
      const removed = await outbox.seriesEventIds(event.series_id);
      await seriesDb.deleteSeries(event.series_id);
      if (series) await outbox.recordSeriesDeleted(series, removed);
      return res.json({ ok: true, deleted: 'series' });
    }

    if (scope === 'following' && event.series_id) {
      const series = await outbox.seriesSnapshot(event.series_id);
      const covered = await seriesDb.occurrencesOfSeries(event.series_id, { from: String(event.start_time) });
      const removed = covered.map(occurrence => occurrence.event_id);
      const result = await seriesDb.deleteOccurrencesFrom(event.series_id, String(event.start_time));
      // A repeat with nothing left is a rule for nothing, and the query above
      // has already taken it away with the last of its weeks.
      if (result.remaining === 0) {
        if (series) await outbox.recordSeriesDeleted(series, removed);
      } else {
        await outbox.recordSeriesUpdated(event.series_id, { affectedEventIds: removed });
      }
      return res.json({ ok: true, deleted: result.affectedRows });
    }

    // Read before the deletion, because deleting the last week of a repeat
    // takes the rule with it, and a rule that is gone cannot be described.
    const series = event.series_id ? await outbox.seriesSnapshot(event.series_id) : null;

    await eventsDb.deleteEvent(eventId);
    await outbox.recordEventDeleted(event);
    // The rule still says which dates the series covers, and one of them has
    // just gone. When that was the last of them the rule goes too, whatever
    // scope the request named, and the bot has to be told about the repeat as
    // well as about the week.
    if (event.series_id) {
      const synced = await seriesDb.syncSeriesEnd(event.series_id);
      if (synced?.removed && series) await outbox.recordSeriesDeleted(series, [eventId]);
    }
    res.json({ ok: true, deleted: 1 });
  } catch (err) { next(err); }
}

/**
 * Cancelling is a state, not a delete. The event keeps its page and its date,
 * so the people who planned to go can be told, and the board can put it back
 * if the cancellation was the mistake. Both are editor actions, like every
 * other change to an event.
 */
/**
 * Cancel or restore one event, and leave the entry the Discord bot reads.
 *
 * @param {object} before the event as it stands
 * @param {boolean} cancelled what it is being set to
 * @param {string|null} cancelledAt the time to write, shared by every week of
 *   a series so that they all say they were called off at the same moment
 * @returns {Promise<boolean>} whether anything was changed
 */
async function applyCancellation(before, cancelled, cancelledAt) {
  if (!before || Boolean(before.cancelled_at) === cancelled) return false;
  await eventsDb.updateEvent(before.event_id, { cancelled_at: cancelledAt });
  // A cancellation is its own kind, because the bot says something different
  // about it. Putting an event back is an ordinary update whose one changed
  // field is the time it was cancelled at.
  if (cancelled) await outbox.recordEventCancelled(before.event_id);
  else await outbox.recordEventUpdated(before);
  return true;
}

/**
 * Cancelling and restoring, for one week or for a whole repeat.
 *
 * The scope is read exactly as the update and the delete read it, because a
 * board cancelling a repeating meeting is answering the same question there:
 * this week, this week onwards, or the whole repeat. Without it, cancelling a
 * term of meetings was fifteen clicks and cancelling the wrong week was the
 * likely outcome.
 *
 * A whole repeat leaves one event.cancelled entry per occurrence rather than
 * one entry for the series. That is deliberate: the bot announced each week as
 * its own event and posts about each week on its own, so an entry per week is
 * what it needs to correct what it already said.
 */
async function setCancelled(req, res, next, cancelled) {
  try {
    const eventId = parseInt(req.params.id);
    const event = await eventsDb.getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const isAdmin = req.user.is_global_admin || await checkRsoEditor(req.user.net_id, event.rso_id);
    if (!isAdmin) return res.status(403).json({ error: 'RSO editor access required' });

    const scope = readScope(req);
    if (!scope) return res.status(400).json({ error: `scope must be one of: ${SCOPES.join(', ')}` });

    const cancelled_at = cancelled ? campusNow() : null;

    if (scope === 'one' || !event.series_id) {
      const already = Boolean(event.cancelled_at) === cancelled;
      if (already) return res.json({ ok: true, cancelled_at: event.cancelled_at ?? null });
      await applyCancellation(event, cancelled, cancelled_at);
      return res.json({ ok: true, cancelled_at });
    }

    // Every occurrence the scope covers, including the weeks that were edited
    // on their own. A week that moved is still a week of this meeting, and a
    // board that called the term off did not mean to leave one of them running.
    const from = scope === 'following' ? String(event.start_time) : null;
    const covered = await seriesDb.occurrencesOfSeries(event.series_id, { from });
    for (const occurrence of covered) {
      const before = occurrence.event_id === eventId
        ? event
        : await eventsDb.getEventById(occurrence.event_id);
      await applyCancellation(before, cancelled, cancelled_at);
    }
    res.json({ ok: true, cancelled_at });
  } catch (err) { next(err); }
}

export function cancelEvent(req, res, next)  { return setCancelled(req, res, next, true); }
export function restoreEvent(req, res, next) { return setCancelled(req, res, next, false); }
