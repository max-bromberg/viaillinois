import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, or, sql, count } from 'drizzle-orm';
import db from '../client.ts';
import {
  courseSections, courses, eventSeries, events, locations, midterms, rsOs, rsoMemberships, users,
} from '../schema/schema.ts';
import { EVENT_COLUMNS, withEventJoins } from './eventColumns.ts';
import { campusStartOfToday } from '../../lib/timezone.js';

/**
 * Everything the Discord bot reads, in one place and written with Drizzle.
 *
 * The reading endpoints answer questions the website already answers, but not
 * in the shapes the website's own queries return: the bot needs the RSO on
 * every event so it can route an announcement, the interest count beside it so
 * a card can say how many people mean to come, and the location note so the
 * message at the door matches the page. Where a raw query already answers a
 * question exactly, the route calls that query rather than a copy of it, and
 * what is here is what is genuinely new.
 */

export type EventFilters = {
  rsoIds?: number[],
  from?: string | null,
  to?: string | null,
  timeframe?: string,
  /**
   * Which RSOs' internal events the caller may see. An empty list is nobody's,
   * which is what a request with no acting person gets, and null is every one,
   * which only a global administrator gets.
   */
  privateRsoIds?: number[] | null,
  limit?: number,
  offset?: number,
};

/**
 * The feed's filters, as the web platform applies them, so that an event
 * that is off the website's upcoming feed is off the bot's too.
 */
function eventConditions(filters: EventFilters) {
  const { rsoIds = [], from = null, to = null, timeframe = 'upcoming', privateRsoIds = [] } = filters;
  const conditions = [];

  if (rsoIds.length) conditions.push(inArray(events.rsoId, rsoIds));
  if (from) conditions.push(gte(events.startTime, from));
  if (to) conditions.push(lte(events.startTime, to));

  // A cancelled event is not coming up, whatever its date says, and it belongs
  // in the archive from the moment it is cancelled. This is the rule the
  // website's own feed applies, written once more here rather than differently.
  const today = campusStartOfToday();
  if (timeframe === 'upcoming') conditions.push(gte(events.startTime, today), isNull(events.cancelledAt));
  if (timeframe === 'archived') conditions.push(or(lt(events.startTime, today), isNotNull(events.cancelledAt)));

  if (privateRsoIds !== null) {
    conditions.push(privateRsoIds.length
      ? or(eq(events.isPrivate, 0), inArray(events.rsoId, privateRsoIds))
      : eq(events.isPrivate, 0));
  }
  return conditions.length ? and(...conditions) : undefined;
}

/** Events matching the feed's filters, in the order that timeframe reads in. */
export async function listEvents(filters: EventFilters = {}) {
  const { timeframe = 'upcoming', limit = 50, offset = 0 } = filters;
  return withEventJoins(db.select(EVENT_COLUMNS).from(events))
    .where(eventConditions(filters))
    .orderBy(timeframe === 'archived' ? desc(events.startTime) : asc(events.startTime))
    .limit(limit)
    .offset(offset);
}

/** How many events match, counted against the same filters as the page. */
export async function countEvents(filters: EventFilters = {}) {
  const rows = await db
    .select({ total: count() })
    .from(events)
    .where(eventConditions(filters));
  return Number(rows[0]?.total ?? 0);
}

/** Every RSO, for autocomplete and for setting up a community server. */
export async function listRsos({ limit = 500, offset = 0 }: { limit?: number, offset?: number } = {}) {
  return db
    .select({
      rso_id:      rsOs.rsoId,
      name:        rsOs.name,
      description: rsOs.description,
      logo_color:  rsOs.logoColor,
    })
    .from(rsOs)
    .orderBy(asc(rsOs.name))
    .limit(limit)
    .offset(offset);
}

/** One RSO, or null when nothing has that identifier. */
export async function getRso(rsoId: number) {
  const rows = await db
    .select({
      rso_id:      rsOs.rsoId,
      name:        rsOs.name,
      description: rsOs.description,
      logo_color:  rsOs.logoColor,
    })
    .from(rsOs)
    .where(eq(rsOs.rsoId, rsoId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Who belongs to an RSO and in what role, for reconciling Discord roles in a
 * bound server. Only a board member of that RSO may ask.
 */
export async function getRsoMembers(rsoId: number, { limit = 500, offset = 0 }: { limit?: number, offset?: number } = {}) {
  return db
    .select({
      net_id:    rsoMemberships.netId,
      full_name: users.fullName,
      role:      rsoMemberships.role,
    })
    .from(rsoMemberships)
    .innerJoin(users, eq(users.netId, rsoMemberships.netId))
    .where(eq(rsoMemberships.rsoId, rsoId))
    .orderBy(asc(rsoMemberships.netId))
    .limit(limit)
    .offset(offset);
}

/**
 * The exams that are confirmed or still waiting to be confirmed. A cancelled
 * exam is left out, because the schedule exists to say when to revise.
 */
export async function listMidterms(filters: {
  courseCode?: string | null, from?: string | null, to?: string | null,
  limit?: number, offset?: number,
} = {}) {
  const { courseCode = null, from = null, to = null, limit = 500, offset = 0 } = filters;
  const conditions = [inArray(midterms.status, ['Confirmed', 'Pending'])];
  if (courseCode) conditions.push(eq(midterms.courseCode, courseCode));
  if (from) conditions.push(gte(midterms.startTime, from));
  if (to) conditions.push(lte(midterms.startTime, to));

  return db
    .select({
      midterm_id:    midterms.midtermId,
      course_code:   midterms.courseCode,
      course_title:  courses.title,
      title:         midterms.title,
      start_time:    midterms.startTime,
      end_time:      midterms.endTime,
      status:        midterms.status,
      location_text: midterms.locationText,
      building:      locations.building,
      room_number:   locations.roomNumber,
    })
    .from(midterms)
    .innerJoin(courses, eq(courses.courseCode, midterms.courseCode))
    .leftJoin(locations, eq(locations.locationId, midterms.locationId))
    .where(and(...conditions))
    .orderBy(asc(midterms.startTime))
    .limit(limit)
    .offset(offset);
}

/**
 * The characters LIKE reads as wildcards, escaped, so that a course search for
 * a literal underscore finds a course with an underscore in it.
 */
function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, character => `\\${character}`)}%`;
}

/** Course search for autocomplete, by code or by title. */
export async function searchCourses(term: string, limit = 25) {
  const pattern = likePattern(term);
  return db
    .select({ course_code: courses.courseCode, title: courses.title })
    .from(courses)
    .where(or(like(courses.courseCode, pattern), like(courses.title, pattern)))
    .orderBy(asc(courses.courseCode))
    .limit(limit);
}

/** Every room in one building, by its canonical name. */
export async function listRoomsInBuilding(building: string) {
  return db
    .select({
      location_id:      locations.locationId,
      building:         locations.building,
      room_number:      locations.roomNumber,
      max_capacity:     locations.maxCapacity,
      has_av_equipment: locations.hasAvEquipment,
    })
    .from(locations)
    .where(eq(locations.building, building))
    .orderBy(asc(locations.roomNumber));
}

/** The letters the timetable writes a weekday as, Sunday first. */
const DAY_LETTERS = ['U', 'M', 'T', 'W', 'R', 'F', 'S'];

/**
 * A window of wall clock time, cut into one span per campus day, because a
 * course section says which weekday it meets on and at what time of day rather
 * than naming a date. A window that runs past the cap below is truncated, and
 * the route refuses a window that long before it ever gets here.
 */
export function daySpans(from: string, to: string, maxDays = 14) {
  const start = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(from);
  const end = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(to);
  if (!start || !end || `${start[1]} ${start[2]}` >= `${end[1]} ${end[2]}`) return [];

  const spans = [];
  let date = start[1];
  for (let day = 0; day < maxDays && date <= end[1]; day++) {
    spans.push({
      day:   DAY_LETTERS[new Date(`${date}T00:00:00Z`).getUTCDay()],
      start: date === start[1] ? start[2] : '00:00:00',
      end:   date === end[1] ? end[2] : '23:59:59',
    });
    date = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return spans.filter(span => span.start < span.end);
}

/**
 * The rooms a class meets in during a window.
 *
 * The booking check weighs VIA's own events and the facility reservations it
 * collects, which are the two things a board can negotiate over. Somebody
 * asking which rooms are free at six also needs to be told about the class
 * that meets there, so this reading exists beside that one rather than inside
 * it, and the conflict detector unions the two.
 */
export async function getSectionsOccupying(from: string, to: string) {
  const spans = daySpans(from, to);
  if (!spans.length) return [];

  const clauses = spans.map(span => and(
    like(courseSections.dayOfWeek, `%${span.day}%`),
    lt(courseSections.startTime, span.end),
    gt(courseSections.endTime, span.start),
  ));
  const rows = await db
    .selectDistinct({ location_id: courseSections.locationId })
    .from(courseSections)
    .where(or(...clauses));
  return rows.map(row => row.location_id);
}
