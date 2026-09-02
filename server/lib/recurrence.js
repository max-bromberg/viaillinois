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

/** A wall clock reading as the UTC instant of the same fields, for arithmetic. */
function asUtc(wallClock) {
  const [date, time = '00:00:00'] = wallClock.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, s);
}

const pad = n => String(n).padStart(2, '0');

function asWallClock(instant) {
  const d = new Date(instant);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    + ` ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * A wall clock reading a number of minutes later, still wall clock.
 *
 * @param {string} wallClock YYYY-MM-DD HH:MM:SS
 * @param {number} minutes
 */
export function addMinutes(wallClock, minutes) {
  return asWallClock(asUtc(wallClock) + minutes * MS_PER_MINUTE);
}

/** The hour of the day an event starts, as MySQL stores a TIME. */
export function timeOfDay(wallClock) {
  return wallClock.split(' ')[1] ?? '00:00:00';
}

/** How long an event runs, in whole minutes, including one that passes midnight. */
export function durationMinutes(start, end) {
  return Math.round((asUtc(end) - asUtc(start)) / MS_PER_MINUTE);
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

  const time = timeOfDay(startTime);
  const length = durationMinutes(startTime, endTime);
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
