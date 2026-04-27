import * as eventsDb from '../db/queries/events.js';
import * as rsoDb from '../db/queries/rso.js';
import * as advancedDb from '../db/queries/advanced.js';

import { checkRsoAdmin, checkRsoEditor } from '../middleware/auth.js';

export async function listEvents(req, res, next) {
  try {
    const { tags, startDate, endDate, keyword, limit = 50, offset = 0 } = req.query;
    const filters = {
      tags:      tags      ? (Array.isArray(tags) ? tags : [tags]) : [],
      startDate: startDate || null,
      endDate:   endDate   || null,
      keyword:   keyword   || null,
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
      const hasBoardRole = memberships.some(m => ['Board', 'Editor'].includes(m.role));
      if (hasBoardRole) {
        [[{ total }], events] = await Promise.all([
          eventsDb.countAllEvents(filters),
          eventsDb.getAllEvents(filters),
        ]);
      } else {
        [[{ total }], events] = await Promise.all([
          eventsDb.countPublicEvents(filters),
          eventsDb.getPublicEvents(filters),
        ]);
      }
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
    res.json({ event });
  } catch (err) { next(err); }
}

export async function createEvent(req, res, next) {
  try {
    const { rso_id, location_id, title, description, start_time, end_time, is_private = false, tags = [] } = req.body;
    if (!rso_id || !location_id || !title || !start_time || !end_time) {
      return res.status(400).json({ error: 'rso_id, location_id, title, start_time, end_time required' });
    }
    const result = await advancedDb.createEventTransactional(
      { rso_id, created_by: req.user.net_id, location_id, title, description, start_time, end_time, is_private },
      tags,
      req.user.is_global_admin
    );
    if (result.conflict)     return res.status(409).json({ error: 'Location is already booked for this time' });
    if (result.unauthorized) return res.status(403).json({ error: 'RSO editor access required' });
    res.status(201).json({ event_id: result.eventId });
  } catch (err) { next(err); }
}

export async function updateEvent(req, res, next) {
  try {
    const eventId = parseInt(req.params.id);
    const event = await eventsDb.getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const isAdmin = req.user.is_global_admin || await checkRsoEditor(req.user.net_id, event.rso_id);
    if (!isAdmin) return res.status(403).json({ error: 'RSO editor access required' });
    const { location_id, title, description, start_time, end_time, is_private, tags } = req.body;
    if (location_id && start_time && end_time) {
      const conflict = await checkConflict(location_id, start_time, end_time, eventId);
      if (conflict) return res.status(409).json({ error: 'Location is already booked for this time' });
    }
    await eventsDb.updateEvent(eventId, { location_id, title, description, start_time, end_time, is_private });
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

export async function rsvpEvent(req, res, next) {
  try {
    const eventId = parseInt(req.params.id);
    const { status = 'Going' } = req.body;
    if (!['Going', 'Maybe', 'Not Going'].includes(status)) {
      return res.status(400).json({ error: 'status must be Going, Maybe, or Not Going' });
    }
    await eventsDb.upsertRsvp(req.user.net_id, eventId, status);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function getEventRsvps(req, res, next) {
  try {
    const eventId = parseInt(req.params.id);
    const event = await eventsDb.getEventById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const rows = await eventsDb.getEventRsvpCounts(eventId);
    const counts = { Going: 0, Maybe: 0, 'Not Going': 0 };
    rows.forEach(r => { counts[r.status] = r.count; });
    res.json({ counts });
  } catch (err) { next(err); }
}
