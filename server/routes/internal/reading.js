import { Router } from 'express';
import { requireRSOAdmin } from '../../middleware/auth.js';
import { sendApiError, ERROR_CODES, withErrorCode } from '../../lib/apiError.js';
import { readPaging, PAGING_LIMITS } from '../../lib/pagination.js';
import { BUILDING_CODES, lookupBuilding } from '../../lib/buildingCodes.js';
import { expandQuery } from '../../lib/locationSearch.js';
import { buildCalendar } from '../../lib/ics.js';
import * as reads from '../../db/queries/internalReads.ts';
import { getEventById } from '../../db/queries/events.js';
import { getUserMemberships } from '../../db/queries/rso.js';
import { searchLocations } from '../../db/queries/locations.js';
import { getSectionsForCourses } from '../../db/queries/courses.js';
import { occupiedLocationIds } from '../../services/conflictDetector.js';

/**
 * Everything the Discord bot reads.
 *
 * The rules these endpoints apply are the website's rules. An event that is
 * off the upcoming feed is off this one, an internal event is shown only to
 * somebody the web platform agrees is a member of that RSO, and the listing
 * ceilings are the ones the public feed uses. Where the website already has a
 * query that answers the question, it is called rather than rewritten, and the
 * queries that are genuinely new are in db/queries/internalReads.ts.
 *
 * Times need no conversion here. The campus time middleware is mounted for the
 * whole application, so every wall clock reading in a JSON answer leaves with
 * the campus offset already on it.
 */

/** The timeframes a request may name, as the website's feed names them. */
const TIMEFRAMES = ['upcoming', 'archived', 'all'];

/** As many RSOs as anybody could tick, which makes this a guard rather than a limit. */
const MAX_RSO_FILTER = 200;

/** How many events an RSO's page carries, which is a few rather than a term. */
const RSO_EVENT_COUNT = 5;

/** Longest window the free room search will look at, so the day by day scan is bounded. */
const MAX_FREE_ROOM_DAYS = 7;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_AND_TIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

/** A path segment that has to be a positive whole number, or null. */
function identifier(raw) {
  return /^\d+$/.test(String(raw ?? '')) ? Number(raw) : null;
}

/**
 * A campus wall clock date or date and time from the query string. A date on
 * its own means the whole day, which end of it depending on which end of the
 * window the value is.
 *
 * @returns {{ value: string|null, error?: string }}
 */
function wallClock(raw, { endOfDay = false } = {}) {
  if (raw === undefined || raw === null || raw === '') return { value: null };
  const text = String(raw).trim();
  if (DATE_ONLY.test(text)) return { value: `${text} ${endOfDay ? '23:59:59' : '00:00:00'}` };
  if (DATE_AND_TIME.test(text)) return { value: text.replace('T', ' ') };
  return {
    value: null,
    error: 'A date has to be written as YYYY-MM-DD, or as YYYY-MM-DD HH:MM:SS for a time of day.',
  };
}

/** The RSOs a request named, as numbers, or null when the value is not that. */
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

/**
 * Whose internal events the caller may be shown.
 *
 * An empty list is nobody's, which is what a request that acts as nobody gets
 * and what a request that did not ask for internal events gets. Null is every
 * RSO, which only a global administrator gets.
 *
 * @returns {Promise<number[]|null>}
 */
async function visibleInternalRsos(req, asked) {
  if (!asked || !req.user) return [];
  if (req.user.is_global_admin) return null;
  const memberships = await getUserMemberships(req.user.net_id);
  return memberships.map(membership => membership.rso_id);
}

/** Whether the acting person, if there is one, may be shown this event. */
async function maySeeEvent(req, event) {
  if (!event.is_private) return true;
  if (!req.user) return false;
  if (req.user.is_global_admin) return true;
  const memberships = await getUserMemberships(req.user.net_id);
  return memberships.some(membership => membership.rso_id === event.rso_id);
}

/**
 * One event in the shape the internal service API answers with, whichever
 * query produced the row, so that a list entry and an event's own answer are
 * the same object with the same fields.
 */
function presentEvent(row) {
  return {
    event_id:      row.event_id,
    rso_id:        row.rso_id,
    rso_name:      row.rso_name ?? null,
    title:         row.title,
    description:   row.description ?? null,
    start_time:    row.start_time,
    end_time:      row.end_time,
    is_private:    Boolean(row.is_private),
    cancelled_at:  row.cancelled_at ?? null,
    location_id:   row.location_id ?? null,
    building:      row.building ?? null,
    room_number:   row.room_number ?? null,
    location_text: row.location_text ?? null,
    location_note: row.location_note ?? null,
    series_id:             row.series_id ?? null,
    series_frequency:      row.series_frequency ?? null,
    series_interval_weeks: row.series_interval_weeks ?? null,
    series_days_of_week:   row.series_days_of_week ?? null,
    series_ends_on:        row.series_ends_on ?? null,
    interest_count: Number(row.interest_count ?? 0),
  };
}

/**
 * The building a search term names, expanded from a code where it is one, so
 * that ECEB and the full name both reach the same rooms.
 */
function canonicalBuilding(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const code = BUILDING_CODES[text.toUpperCase()];
  if (code) return code;
  const words = expandQuery(text);
  const match = Object.values(BUILDING_CODES)
    .find(name => words.every(word => expandQuery(name).includes(word)));
  return match ?? text;
}

export function createReadingRouter() {
  const router = Router();

  router.get('/rsos', async (req, res, next) => {
    try {
      const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.rsos);
      if (refusal) return sendApiError(res, 400, ERROR_CODES.INVALID, refusal);
      res.json({ rsos: await reads.listRsos({ limit, offset }) });
    } catch (err) { next(err); }
  });

  router.get('/rsos/:id/members', withErrorCode(requireRSOAdmin), async (req, res, next) => {
    try {
      const rsoId = identifier(req.params.id);
      const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.rsos);
      if (refusal) return sendApiError(res, 400, ERROR_CODES.INVALID, refusal);
      res.json({ members: await reads.getRsoMembers(rsoId, { limit, offset }) });
    } catch (err) { next(err); }
  });

  router.get('/rsos/:id', async (req, res, next) => {
    try {
      const rsoId = identifier(req.params.id);
      if (rsoId === null) {
        return sendApiError(res, 400, ERROR_CODES.INVALID, 'An RSO identifier has to be a whole number.');
      }
      const rso = await reads.getRso(rsoId);
      if (!rso) return sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'There is no RSO with that identifier.');

      const events = await reads.listEvents({
        rsoIds: [rsoId],
        timeframe: 'upcoming',
        privateRsoIds: await visibleInternalRsos(req, true),
        limit: RSO_EVENT_COUNT,
        offset: 0,
      });
      res.json({ rso, events: events.map(presentEvent) });
    } catch (err) { next(err); }
  });

  router.get('/events', async (req, res, next) => {
    try {
      const timeframe = req.query.timeframe ?? 'upcoming';
      if (!TIMEFRAMES.includes(timeframe)) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          `timeframe has to be one of: ${TIMEFRAMES.join(', ')}.`);
      }
      const rsoIds = readRsoIds(req.query.rso_ids);
      if (rsoIds === null) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'rso_ids has to be a list of at most 200 whole numbers, separated by commas.');
      }
      const from = wallClock(req.query.from);
      const to = wallClock(req.query.to, { endOfDay: true });
      if (from.error || to.error) {
        return sendApiError(res, 400, ERROR_CODES.INVALID, from.error ?? to.error);
      }
      const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.events);
      if (refusal) return sendApiError(res, 400, ERROR_CODES.INVALID, refusal);

      const filters = {
        rsoIds, from: from.value, to: to.value, timeframe,
        privateRsoIds: await visibleInternalRsos(req, req.query.include_internal === 'true'),
        limit, offset,
      };
      const [rows, total] = await Promise.all([reads.listEvents(filters), reads.countEvents(filters)]);
      res.json({ events: rows.map(presentEvent), total });
    } catch (err) { next(err); }
  });

  /** The one event, or a refusal that says as little as the public page says. */
  async function readOneEvent(req, res) {
    const eventId = identifier(req.params.id);
    if (eventId === null) {
      sendApiError(res, 400, ERROR_CODES.INVALID, 'An event identifier has to be a whole number.');
      return null;
    }
    const event = await getEventById(eventId);
    if (!event || !(await maySeeEvent(req, event))) {
      sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'There is no event with that identifier.');
      return null;
    }
    return event;
  }

  router.get('/events/:id/calendar', async (req, res, next) => {
    try {
      const event = await readOneEvent(req, res);
      if (!event) return;
      res.type('text/calendar; charset=utf-8');
      res.send(buildCalendar([event]));
    } catch (err) { next(err); }
  });

  router.get('/events/:id', async (req, res, next) => {
    try {
      const event = await readOneEvent(req, res);
      if (!event) return;
      res.json({ event: presentEvent(event) });
    } catch (err) { next(err); }
  });

  router.get('/midterms', async (req, res, next) => {
    try {
      const from = wallClock(req.query.from);
      const to = wallClock(req.query.to, { endOfDay: true });
      if (from.error || to.error) {
        return sendApiError(res, 400, ERROR_CODES.INVALID, from.error ?? to.error);
      }
      const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.midterms);
      if (refusal) return sendApiError(res, 400, ERROR_CODES.INVALID, refusal);

      const midterms = await reads.listMidterms({
        courseCode: req.query.course ? String(req.query.course).trim() : null,
        from: from.value, to: to.value, limit, offset,
      });
      res.json({ midterms });
    } catch (err) { next(err); }
  });

  router.get('/courses', async (req, res, next) => {
    try {
      const term = String(req.query.query ?? '').trim();
      const { limit, offset, refusal } = readPaging(req.query, { ...PAGING_LIMITS.courses, defaultLimit: 25 });
      if (refusal) return sendApiError(res, 400, ERROR_CODES.INVALID, refusal);
      // A search box that lists the whole catalogue before a key is pressed is
      // not a search box, so an empty term answers nothing.
      if (!term) return res.json({ courses: [] });

      const courses = await reads.searchCourses(term, limit);
      if (req.query.sections !== 'true' || courses.length === 0) return res.json({ courses });

      const sections = await getSectionsForCourses(courses.map(course => course.course_code));
      res.json({
        courses: courses.map(course => ({
          ...course,
          sections: sections
            .filter(section => section.course_code === course.course_code)
            .map(({ course_code, ...section }) => section),
        })),
      });
    } catch (err) { next(err); }
  });

  router.get('/locations/free', async (req, res, next) => {
    try {
      const building = canonicalBuilding(req.query.building);
      if (!building) {
        return sendApiError(res, 400, ERROR_CODES.INVALID, 'A building is required, by code or by name.');
      }
      const from = wallClock(req.query.from);
      const to = wallClock(req.query.to, { endOfDay: true });
      if (from.error || to.error) {
        return sendApiError(res, 400, ERROR_CODES.INVALID, from.error ?? to.error);
      }
      if (!from.value || !to.value || from.value >= to.value) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          'A window needs a from and a to, and the to has to come after the from.');
      }
      const days = (Date.parse(`${to.value.slice(0, 10)}T00:00:00Z`)
        - Date.parse(`${from.value.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
      if (days > MAX_FREE_ROOM_DAYS) {
        return sendApiError(res, 400, ERROR_CODES.INVALID,
          `A window can cover at most ${MAX_FREE_ROOM_DAYS} days.`);
      }

      const [rooms, occupied] = await Promise.all([
        reads.listRoomsInBuilding(building),
        occupiedLocationIds(from.value, to.value),
      ]);
      res.json({
        building,
        from: from.value,
        to: to.value,
        locations: rooms.filter(room => !occupied.has(room.location_id)),
      });
    } catch (err) { next(err); }
  });

  router.get('/locations', async (req, res, next) => {
    try {
      const term = String(req.query.query ?? '').trim();
      const { limit, refusal } = readPaging(req.query, PAGING_LIMITS.venues);
      if (refusal) return sendApiError(res, 400, ERROR_CODES.INVALID, refusal);
      if (!term) return res.json({ locations: [] });
      res.json({ locations: await searchLocations(term, limit) });
    } catch (err) { next(err); }
  });

  router.get('/buildings/:code', (req, res) => {
    const building = lookupBuilding(req.params.code);
    if (!building) {
      return sendApiError(res, 404, ERROR_CODES.NOT_FOUND, 'VIA does not know that building code.');
    }
    res.json({ building });
  });

  return router;
}
