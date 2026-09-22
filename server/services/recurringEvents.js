import {
  expandOccurrences, expandMonthly, expandDates, isCalendarDate,
  timeOfDay, durationMinutes, toWallClock, weekdaysOf, MAX_OCCURRENCES, WEEKDAYS,
} from '../lib/recurrence.js';
import { termForDate, addDays, weekdayOf } from '../lib/academicCalendar.js';

/**
 * Turning a repeat an organizer asked for into a series and its occurrences.
 *
 * Kept out of the database layer on purpose. Deciding what a rule means, which
 * weeks it produces and which of those the room is already taken for is the
 * part worth testing on its own, and none of it needs a connection.
 */

/**
 * A repeat is a term long arrangement. Anything beyond a year is either a
 * mistake or a way to ask for thousands of rows, and either way the answer is
 * the same.
 */
const MAX_DAYS = 366;

/** Every other week is the far end of what a form offers. A calendar file can carry more. */
const MAX_INTERVAL_WEEKS = 8;

/** A year is the far end of a repeat, so a monthly interval cannot exceed it. */
const MAX_INTERVAL_MONTHS = 12;

/**
 * The shapes a repeat can take.
 *
 * A repeat used to be every week or every other week and nothing else, so a
 * board holding a meeting once a month, or on a set of dates that follow no
 * rule at all, entered each one by hand.
 */
const FREQUENCIES = ['weekly', 'monthly', 'dates'];

const problem = message => ({ error: message });

/** The days a rule runs on, whether they arrive as a list or as the stored string. */
function readDays(value) {
  if (value == null || value === '') return null;
  const given = Array.isArray(value) ? value : String(value).split(',');
  const days = given.map(day => String(day).trim()).filter(Boolean);
  if (days.length === 0) return null;
  if (days.some(day => !WEEKDAYS.includes(day))) return 'invalid';
  return WEEKDAYS.filter(day => days.includes(day));
}

/**
 * Work out the series row and the occurrences a repeat produces.
 *
 * The end of the series is the last date it actually runs on rather than the
 * date that was asked for, so a page saying a meeting repeats until the eighth
 * of December names a day the meeting happens.
 *
 * @param {{ startTime: string, endTime: string,
 *           recurrence?: { interval_weeks?: number, days_of_week?: string[]|string,
 *                          starts_on?: string, ends_on?: string },
 *           term?: object }} params
 * @returns {{ error: string } | { series: object, occurrences: Array<{date, start, end}> }}
 */
export function planSeries({ startTime, endTime, recurrence = {}, term = null }) {
  if (!startTime || !endTime) return problem('A repeating event needs a start time and an end time.');

  // The form posts what a browser date and time field holds, which writes a T
  // where the database writes a space and leaves the seconds off. Both readings
  // are read into the one shape here, so everything below compares and stores
  // times of the same shape.
  const start = toWallClock(startTime);
  const end = toWallClock(endTime);
  if (!start || !end) return problem('The start time and the end time each have to be a date and a time.');
  if (end <= start) return problem('The end time has to be after the start time.');

  const frequency = recurrence.frequency ?? 'weekly';
  if (!FREQUENCIES.includes(frequency)) {
    return problem(`A repeat has to be one of ${FREQUENCIES.join(', ')}.`);
  }

  if (frequency === 'dates') return planPickedDates({ start, end, recurrence });

  const startsOn = (recurrence.starts_on ?? start).slice(0, 10);
  const calendar = term ?? termForDate(startsOn);
  const endsOn = (recurrence.ends_on ?? calendar.instructionEnd).slice(0, 10);
  if (endsOn < startsOn) return problem('The repeat cannot end before it begins.');
  if (endsOn > addDays(startsOn, MAX_DAYS)) return problem('A repeat can run for at most a year.');

  const span = { start, end, startsOn, endsOn, breaks: calendar.breaks ?? [] };
  return frequency === 'monthly'
    ? planMonthly({ ...span, recurrence })
    : planWeekly({ ...span, recurrence });
}

/** The occurrences a plan produces, or the sentence saying why there are none. */
function seriesOf(occurrences, rule, start, end) {
  if (occurrences.length === 0) {
    return problem('That repeat produces no events. Check the days of the week and the end date.');
  }
  return {
    series: {
      frequency: 'weekly',
      interval_weeks: null,
      interval_months: null,
      days_of_week: null,
      month_day: null,
      month_week: null,
      ...rule,
      starts_on: occurrences[0].date,
      ends_on: occurrences.at(-1).date,
      start_of_day: timeOfDay(start),
      duration_minutes: durationMinutes(start, end),
    },
    occurrences,
  };
}

/** Every so many weeks, on the days chosen. */
function planWeekly({ start, end, startsOn, endsOn, breaks, recurrence }) {
  const days = readDays(recurrence.days_of_week);
  if (days === 'invalid') {
    return problem(`A day of the week has to be one of ${WEEKDAYS.join(', ')}.`);
  }
  const daysOfWeek = days ?? [WEEKDAYS[weekdayOf(startsOn)]];

  const intervalWeeks = Number(recurrence.interval_weeks ?? 1);
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > MAX_INTERVAL_WEEKS) {
    return problem(`The interval has to be a whole number of weeks, from 1 to ${MAX_INTERVAL_WEEKS}.`);
  }

  const occurrences = expandOccurrences({
    startTime: start, endTime: end, daysOfWeek, intervalWeeks, startsOn, endsOn, skip: breaks,
  });

  return seriesOf(occurrences, {
    frequency: 'weekly',
    interval_weeks: intervalWeeks,
    days_of_week: daysOfWeek.join(','),
  }, start, end);
}

/**
 * Once every so many months, on a date in the month or on a weekday of it.
 *
 * The two shapes are what a person means by "once a month", and a rule can only
 * be one of them: the fifteenth and the second Tuesday are different dates in
 * every month, so being told both says nothing about which was meant.
 */
function planMonthly({ start, end, startsOn, endsOn, breaks, recurrence }) {
  const byDate = recurrence.month_day !== undefined && recurrence.month_day !== null;
  const byWeekday = recurrence.month_week !== undefined && recurrence.month_week !== null;
  if (byDate === byWeekday) {
    return problem('A monthly repeat needs either a date in the month or a weekday of it, and not both.');
  }

  const intervalMonths = Number(recurrence.interval_months ?? 1);
  if (!Number.isInteger(intervalMonths) || intervalMonths < 1 || intervalMonths > MAX_INTERVAL_MONTHS) {
    return problem(`The interval has to be a whole number of months, from 1 to ${MAX_INTERVAL_MONTHS}.`);
  }

  let monthDay = null;
  let monthWeek = null;
  let weekday = null;

  if (byDate) {
    monthDay = Number(recurrence.month_day);
    if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) {
      return problem('The day of the month has to be a whole number from 1 to 31.');
    }
  } else {
    monthWeek = Number(recurrence.month_week);
    if (!Number.isInteger(monthWeek) || monthWeek === 0 || monthWeek < -1 || monthWeek > 5) {
      return problem('The week of the month has to be 1 to 5, or -1 for the last one.');
    }
    const days = readDays(recurrence.days_of_week);
    if (days === 'invalid' || days === null) {
      return problem(`A monthly repeat on a weekday of the month needs a day of the week, one of ${WEEKDAYS.join(', ')}.`);
    }
    weekday = days[0];
  }

  const occurrences = expandMonthly({
    startTime: start, endTime: end,
    intervalMonths, monthDay, monthWeek, weekday,
    startsOn, endsOn, skip: breaks,
  });

  return seriesOf(occurrences, {
    frequency: 'monthly',
    interval_months: intervalMonths,
    month_day: monthDay,
    month_week: monthWeek,
    days_of_week: weekday,
  }, start, end);
}

/**
 * A set of dates the organizer picked.
 *
 * There is no rule to bound, so the dates themselves are the bound, and nothing
 * is stepped over: a date somebody chose is a date they meant.
 */
function planPickedDates({ start, end, recurrence }) {
  const given = Array.isArray(recurrence.dates) ? recurrence.dates : [];
  if (given.length === 0) return problem('Pick at least one date for this repeat.');
  if (given.length > MAX_OCCURRENCES) {
    return problem(`A repeat can hold at most ${MAX_OCCURRENCES} dates.`);
  }
  if (!given.every(isCalendarDate)) {
    return problem('Every picked date has to be a date, written as YYYY-MM-DD.');
  }

  const occurrences = expandDates({ startTime: start, endTime: end, dates: given });
  if (occurrences.length > 0) {
    const span = occurrences.at(-1).date;
    if (span > addDays(occurrences[0].date, MAX_DAYS)) {
      return problem('A repeat can run for at most a year.');
    }
  }

  return seriesOf(occurrences, {
    frequency: 'dates',
    days_of_week: weekdaysOf(occurrences.map(occurrence => occurrence.date)).join(',') || null,
  }, start, end);
}

/**
 * Split the occurrences into the ones whose room is free, the dates another
 * event has, and the dates the room is reserved on.
 *
 * A booked week is not a reason to refuse a term of meetings. Two bookings that
 * only touch, one ending exactly as the other begins, are not a clash.
 *
 * The two kinds of occupancy are answered differently. Another event on VIA is
 * a clash, because a room given to two events is something VIA created and can
 * prevent. A reservation collected from Ad Astra or from Tableau is not a
 * clash, because it is very often the organization's own booking arriving here
 * before the organization gets around to entering the event, and VIA observes
 * the reservation system rather than asserting bookings of its own. Those weeks
 * are kept and reported, so the board is told what the room already shows.
 *
 * A row that names no source counts as an event. Refusing a room that turns out
 * to be free is a smaller harm than handing an organization a room somebody
 * else holds.
 *
 * @param {Array<{date: string, start: string, end: string}>} occurrences
 * @param {Array<{start_time: string, end_time: string, source?: string}>} busy
 * @returns {{ keep: Array<object>, skipped: string[], reserved: string[] }}
 */
export function splitByBusyRoom(occurrences, busy) {
  const keep = [];
  const skipped = [];
  const reserved = [];
  for (const occurrence of occurrences) {
    const over = busy.filter(taken =>
      String(taken.start_time) < occurrence.end && String(taken.end_time) > occurrence.start);
    if (over.some(taken => taken.source !== 'reservation')) {
      skipped.push(occurrence.date);
      continue;
    }
    if (over.length > 0) reserved.push(occurrence.date);
    keep.push(occurrence);
  }
  return { keep, skipped, reserved };
}
