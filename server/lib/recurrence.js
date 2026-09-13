import { addDays, weekdayOf } from './academicCalendar.js';

/**
 * Turning a repeat rule into dates.
 *
 * A series is stored as its rule and as one ordinary event row per occurrence,
 * so this is the piece that decides which rows exist. It works entirely in
 * campus wall clock, which is what the database holds: an event at six in the
 * evening is at six in the evening on both sides of the day the clocks change,
 * and it stays that way here because no instant is ever constructed.
 */

/** The days of the week, in the order a week runs. */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** iCalendar writes them as two letters. */
const ICS_DAYS = { SU: 'Sun', MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat' };

/**
 * One request should not be able to ask for unbounded work, and no RSO holds
 * two hundred meetings in a term. A rule that would produce more stops here,
 * which is also the backstop for a calendar file carrying a rule with no end.
 */
export const MAX_OCCURRENCES = 200;

const MS_PER_MINUTE = 60_000;

/**
 * The readings that name a time on the campus clock.
 *
 * The database writes one shape, YYYY-MM-DD HH:MM:SS. A browser date and time
 * field writes another, YYYY-MM-DDTHH:MM, with a T in place of the space and no
 * seconds at all, and that is what the create event form posts. Both are the
 * same reading, so both are read here, along with a date on its own, which
 * names midnight.
 */
const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * The calendar fields of a wall clock reading, or null for anything that is not
 * one. A date that no calendar has, such as the thirty first of February, is
 * not one either, because rolling it into the next month would store a day
 * nobody asked for.
 *
 * @param {string|null|undefined} value
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number}|null}
 */
function fieldsOf(value) {
  if (value == null) return null;
  const match = WALL_CLOCK.exec(String(value).trim());
  if (!match) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = match;
  const fields = {
    year: +y, month: +mo, day: +d, hour: +h, minute: +mi, second: +s,
  };
  if (fields.month < 1 || fields.month > 12 || fields.day < 1 || fields.day > 31) return null;
  if (fields.hour > 23 || fields.minute > 59 || fields.second > 59) return null;
  const instant = new Date(Date.UTC(fields.year, fields.month - 1, fields.day));
  if (instant.getUTCMonth() !== fields.month - 1 || instant.getUTCDate() !== fields.day) return null;
  return fields;
}

/** A wall clock reading as the UTC instant of the same fields, for arithmetic. */
function asUtc(wallClock) {
  const f = fieldsOf(wallClock);
  return f === null ? null : Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
}

const pad = n => String(n).padStart(2, '0');

function asWallClock(instant) {
  const d = new Date(instant);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    + ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * A time in the one shape the database holds, YYYY-MM-DD HH:MM:SS, or null for
 * a reading that names no time.
 *
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
export function toWallClock(value) {
  const f = fieldsOf(value);
  if (f === null) return null;
  return `${f.year}-${pad(f.month)}-${pad(f.day)} ${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)}`;
}

/**
 * A wall clock reading a number of minutes later, still wall clock, or null for
 * a reading it cannot make sense of.
 *
 * @param {string} wallClock
 * @param {number} minutes
 * @returns {string|null}
 */
export function addMinutes(wallClock, minutes) {
  const instant = asUtc(wallClock);
  if (instant === null || !Number.isFinite(minutes)) return null;
  return asWallClock(instant + minutes * MS_PER_MINUTE);
}

/**
 * The hour of the day an event starts, as MySQL stores a TIME, or null for a
 * reading it cannot make sense of.
 *
 * @param {string|null|undefined} wallClock
 * @returns {string|null}
 */
export function timeOfDay(wallClock) {
  const f = fieldsOf(wallClock);
  return f === null ? null : `${pad(f.hour)}:${pad(f.minute)}:${pad(f.second)}`;
}

/**
 * How long an event runs, in whole minutes, including one that passes midnight,
 * or null for a pair of readings it cannot make sense of.
 *
 * @param {string|null|undefined} start
 * @param {string|null|undefined} end
 * @returns {number|null}
 */
export function durationMinutes(start, end) {
  const from = asUtc(start);
  const to = asUtc(end);
  if (from === null || to === null) return null;
  return Math.round((to - from) / MS_PER_MINUTE);
}

/** Whether a date falls inside any of a set of ranges, each inclusive of both ends. */
function inAnyRange(date, ranges) {
  return ranges.some(range => date >= range.start && date <= range.end);
}

/**
 * The dates and times a repeat rule produces.
 *
 * The first occurrence is the first listed weekday on or after the start date,
 * which is what an organizer means when they pick a Monday on the form and then
 * ask for Tuesdays. Weeks are counted from the week the rule starts in, so an
 * every other week rule keeps the weeks it began on.
 *
 * @param {{
 *   startTime: string, endTime: string,
 *   daysOfWeek: string[], intervalWeeks?: number,
 *   startsOn: string, endsOn: string,
 *   skip?: Array<{ start: string, end: string }>,
 *   exclude?: string[],
 *   count?: number|null,
 * }} rule
 * @returns {Array<{ date: string, start: string, end: string }>}
 */
export function expandOccurrences(rule) {
  const {
    startTime, endTime, daysOfWeek, intervalWeeks = 1,
    startsOn, endsOn, skip = [], exclude = [], count = null,
  } = rule;

  const wanted = new Set(daysOfWeek);
  if (wanted.size === 0 || !startsOn || !endsOn || endsOn < startsOn) return [];

  // Times that name no time produce no dates. A rule cannot be expanded around
  // an hour that could not be read, and the alternative is rows at midnight
  // with no length.
  const time = timeOfDay(startTime);
  const length = durationMinutes(startTime, endTime);
  if (time === null || length === null) return [];

  const excluded = new Set(exclude.map(value => value.slice(0, 10)));

  // Week zero is the week the rule starts in, counted from its Sunday, so that
  // every other week means the weeks the organizer picked rather than whichever
  // weeks the arithmetic happens to land on.
  const weekOrigin = addDays(startsOn, -weekdayOf(startsOn));
  const interval = Math.max(1, intervalWeeks);

  const limit = count === null ? MAX_OCCURRENCES : Math.min(count, MAX_OCCURRENCES);
  const occurrences = [];
  // A count is how many dates the rule produces, and the dates left out are
  // taken off that set afterwards, which is what RFC 5545 says and what a
  // calendar program does. So a rule for four weeks with one week excluded is
  // three events, not four.
  let produced = 0;

  for (let date = startsOn; date <= endsOn; date = addDays(date, 1)) {
    if (produced >= limit || occurrences.length >= MAX_OCCURRENCES) break;
    if (!wanted.has(WEEKDAYS[weekdayOf(date)])) continue;

    const weeksIn = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${weekOrigin}T00:00:00Z`)) / 604_800_000);
    if (weeksIn % interval !== 0) continue;

    produced += 1;
    if (excluded.has(date)) continue;
    if (inAnyRange(date, skip)) continue;

    const start = `${date} ${time}`;
    occurrences.push({ date, start, end: asWallClock(asUtc(start) + length * MS_PER_MINUTE) });
  }

  return occurrences;
}

/** UNTIL is written as a date, or as a stamp this reads the date off. */
function untilDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * The last day of a month, as a number.
 *
 * Written by hand rather than by rolling a Date past the end of the month,
 * because everything here works in calendar fields rather than in instants.
 */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A year and a month a given number of months after another. */
function shiftMonth(year, month, by) {
  const zeroBased = (year * 12 + (month - 1)) + by;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

const asDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

/**
 * The date of the nth occurrence of a weekday in a month, or null when the
 * month does not have that many.
 *
 * The last one is asked for as -1, which is what a calendar program means by
 * "the last Friday of the month" and is the only position whose date changes
 * from month to month for a reason a person would recognise.
 *
 * @param {number} year
 * @param {number} month 1 to 12
 * @param {number} position 1 to 5, or -1 for the last
 * @param {string} weekday one of WEEKDAYS
 * @returns {string|null}
 */
export function weekdayOfMonth(year, month, position, weekday) {
  const wanted = WEEKDAYS.indexOf(weekday);
  if (wanted === -1) return null;
  const total = daysInMonth(year, month);
  const days = [];
  for (let day = 1; day <= total; day += 1) {
    if (weekdayOf(asDate(year, month, day)) === wanted) days.push(day);
  }
  const chosen = position === -1 ? days.at(-1) : days[position - 1];
  return chosen === undefined ? null : asDate(year, month, chosen);
}

/**
 * The dates and times a monthly rule produces.
 *
 * Two shapes, because those are the two things a person means by "once a
 * month": a date in the month, such as the fifteenth, or a weekday of it, such
 * as the second Tuesday. A month that has no such date, which is what the
 * thirty first of February and the fifth Tuesday of October are, is stepped
 * over rather than slid into the next month, because rolling it forward would
 * put the meeting on a day nobody asked for.
 *
 * Weeks with no classes are stepped over as well, which is what a weekly rule
 * does with the same weeks and for the same reason.
 *
 * @param {{ startTime: string, endTime: string, intervalMonths?: number,
 *           monthDay?: number|null, monthWeek?: number|null, weekday?: string|null,
 *           startsOn: string, endsOn: string,
 *           skip?: Array<{ start: string, end: string }> }} rule
 * @returns {Array<{ date: string, start: string, end: string }>}
 */
export function expandMonthly(rule) {
  const {
    startTime, endTime, intervalMonths = 1,
    monthDay = null, monthWeek = null, weekday = null,
    startsOn, endsOn, skip = [],
  } = rule;

  if (!startsOn || !endsOn || endsOn < startsOn) return [];
  const time = timeOfDay(startTime);
  const length = durationMinutes(startTime, endTime);
  if (time === null || length === null) return [];

  const from = fieldsOf(startsOn);
  if (from === null) return [];
  const interval = Math.max(1, intervalMonths);

  const occurrences = [];
  for (let step = 0; occurrences.length < MAX_OCCURRENCES; step += 1) {
    const { year, month } = shiftMonth(from.year, from.month, step * interval);
    // The first month of a rule can begin before its start date, and a rule
    // whose interval is several months can step a long way past the end, so the
    // loop is stopped by the first day of the month rather than by the date the
    // rule produces in it.
    if (asDate(year, month, 1) > endsOn) break;

    const date = monthDay !== null
      ? (monthDay <= daysInMonth(year, month) ? asDate(year, month, monthDay) : null)
      : weekdayOfMonth(year, month, monthWeek, weekday);

    if (date === null || date < startsOn || date > endsOn) continue;
    if (inAnyRange(date, skip)) continue;

    const start = `${date} ${time}`;
    occurrences.push({ date, start, end: asWallClock(asUtc(start) + length * MS_PER_MINUTE) });
  }
  return occurrences;
}

/**
 * The dates and times a hand picked set of dates produces.
 *
 * Each date takes the hour and the length the form holds, which is what an
 * organizer picking dates on a calendar means. Nothing is stepped over: a date
 * somebody chose is a date they meant, and the weeks with no classes that a
 * rule steps over are weeks nobody chose, which is a different thing.
 *
 * @param {{ startTime: string, endTime: string, dates: string[] }} rule
 * @returns {Array<{ date: string, start: string, end: string }>}
 */
export function expandDates({ startTime, endTime, dates }) {
  const time = timeOfDay(startTime);
  const length = durationMinutes(startTime, endTime);
  if (time === null || length === null) return [];

  const wanted = [...new Set((dates ?? []).map(date => String(date).slice(0, 10)))].sort();
  return wanted.slice(0, MAX_OCCURRENCES).map(date => {
    const start = `${date} ${time}`;
    return { date, start, end: asWallClock(asUtc(start) + length * MS_PER_MINUTE) };
  });
}

/** Whether a value reads as a calendar date, which is what a picked date is. */
export function isCalendarDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    && fieldsOf(value.trim()) !== null;
}

/**
 * Read an RRULE into the rule expandOccurrences takes.
 *
 * Weekly rules only, which is what an RSO calendar carries. Anything else
 * returns null, and the importer reports that rather than quietly importing one
 * week of a series as though it were the whole thing.
 *
 * @param {string|null} text the RRULE value, without the property name
 * @param {{ startDate?: string }} [context] the event's own date, which a rule
 *   naming no day repeats on, as RFC 5545 says it does
 * @returns {{ frequency: 'weekly', intervalWeeks: number, daysOfWeek: string[],
 *             count: number|null, until: string|null }|null}
 */
export function parseRecurrenceRule(text, context = {}) {
  if (typeof text !== 'string' || text.trim() === '') return null;

  const parts = new Map(
    text.trim().split(';')
      .map(part => part.split('='))
      .filter(pair => pair.length === 2)
      .map(([name, value]) => [name.trim().toUpperCase(), value.trim()])
  );

  if ((parts.get('FREQ') ?? '').toUpperCase() !== 'WEEKLY') return null;

  const intervalWeeks = parts.has('INTERVAL') ? parseInt(parts.get('INTERVAL'), 10) : 1;
  if (!Number.isFinite(intervalWeeks) || intervalWeeks < 1) return null;

  const byDay = (parts.get('BYDAY') ?? '')
    .split(',')
    .map(day => ICS_DAYS[day.trim().toUpperCase().slice(-2)])
    .filter(Boolean);

  const daysOfWeek = byDay.length > 0
    ? WEEKDAYS.filter(day => byDay.includes(day))
    : (context.startDate ? [WEEKDAYS[weekdayOf(context.startDate)]] : []);

  const count = parts.has('COUNT') ? parseInt(parts.get('COUNT'), 10) : null;
  const until = parts.has('UNTIL') ? untilDate(parts.get('UNTIL')) : null;

  return {
    frequency: 'weekly',
    intervalWeeks,
    daysOfWeek,
    count: Number.isFinite(count) && count > 0 ? count : null,
    until,
  };
}

/**
 * The weekdays a set of dates falls on, in the order a week runs. Used to turn
 * what an organizer picked, or what a scheduler recommendation covers, back
 * into the rule that produced it.
 */
export function weekdaysOf(dates) {
  const days = new Set(dates.map(date => WEEKDAYS[weekdayOf(date.slice(0, 10))]));
  return WEEKDAYS.filter(day => days.has(day));
}
