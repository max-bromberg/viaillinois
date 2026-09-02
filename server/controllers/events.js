import * as eventsDb from '../db/queries/events.js';
import * as rsoDb from '../db/queries/rso.js';
import * as advancedDb from '../db/queries/advanced.js';
import * as seriesDb from '../db/queries/eventSeries.js';
import { planSeries, splitByBusyRoom } from '../services/recurringEvents.js';

import { checkRsoAdmin, checkRsoEditor } from '../middleware/auth.js';

export async function listEvents(req, res, next) {
  try {
    // The feed is a list of what is coming up, so a request that names no
    // timeframe gets today and later. Events that have already happened are
    // still served, under the archived timeframe, for anyone who asks for them,
    // and a view that spans the calendar, such as the month grid, asks for all.
    const { tags, startDate, endDate, keyword, timeframe = 'upcoming', limit = 50, offset = 0 } = req.query;
    if (!eventsDb.TIMEFRAMES.includes(timeframe)) {
      return res.status(400).json({ error: `timeframe must be one of: ${eventsDb.TIMEFRAMES.join(', ')}` });
    }
    const filters = {
      tags:      tags      ? (Array.isArray(tags) ? tags : [tags]) : [],
      startDate: startDate || null,
      endDate:   endDate   || null,
      keyword:   keyword   || null,
      timeframe,
      limit:     parseInt(limit),
      offset:    parseInt(offset),
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

export async function createEvent(req, res, next) {
  try {
    const { rso_id, title, description, start_time, end_time, is_private = false, tags = [] } = req.body;
    if (!rso_id || !title || !start_time || !end_time) {
      return res.status(400).json({ error: 'rso_id, title, start_time, end_time required' });
    }
    const result = await advancedDb.createEventTransactional(
      {
        rso_id, created_by: req.user.net_id, ...readLocation(req.body),
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
        rso_id: rsoId, created_by: req.user.net_id, location_id, location_text,
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

export async function updateEvent(req, res, next) {
  try {
    const eventId = parseInt(req.params.id);
    const event = await eventsDb.getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const isAdmin = req.user.is_global_admin || await checkRsoEditor(req.user.net_id, event.rso_id);
    if (!isAdmin) return res.status(403).json({ error: 'RSO editor access required' });
    const { title, description, start_time, end_time, is_private, tags } = req.body;
    const { location_id, location_text } = readLocation(req.body);
    // Two events with no room cannot collide, so there is nothing to check.
    if (location_id && start_time && end_time) {
      const conflict = await checkConflict(location_id, start_time, end_time, eventId);
      if (conflict) return res.status(409).json({ error: 'Location is already booked for this time' });
    }
    await eventsDb.updateEvent(eventId, {
      location_id, location_text, title, description, start_time, end_time, is_private,
    });
    if (tags) await eventsDb.setEventTags(eventId, tags);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function deleteEvent(req, res, next) {
  try {
    const eventId = parseInt(req.params.id);
    const event = await eventsDb.getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const isAdmin = await checkRsoEditor(req.user.net_id, event.rso_id);
    if (!isAdmin && !req.user.is_global_admin) return res.status(403).json({ error: 'RSO editor access required' });
    await eventsDb.deleteEvent(eventId);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
