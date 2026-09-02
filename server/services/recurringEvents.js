import { expandOccurrences, timeOfDay, durationMinutes, WEEKDAYS } from '../lib/recurrence.js';
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
  if (endTime <= startTime) return problem('The end time has to be after the start time.');

  const startsOn = (recurrence.starts_on ?? startTime).slice(0, 10);
  const calendar = term ?? termForDate(startsOn);

  const days = readDays(recurrence.days_of_week);
  if (days === 'invalid') {
    return problem(`A day of the week has to be one of ${WEEKDAYS.join(', ')}.`);
  }
  const daysOfWeek = days ?? [WEEKDAYS[weekdayOf(startsOn)]];

  const intervalWeeks = Number(recurrence.interval_weeks ?? 1);
  if (!Number.isInteger(intervalWeeks) || intervalWeeks < 1 || intervalWeeks > MAX_INTERVAL_WEEKS) {
    return problem(`The interval has to be a whole number of weeks, from 1 to ${MAX_INTERVAL_WEEKS}.`);
  }

  const endsOn = (recurrence.ends_on ?? calendar.instructionEnd).slice(0, 10);
  if (endsOn < startsOn) return problem('The repeat cannot end before it begins.');
  if (endsOn > addDays(startsOn, MAX_DAYS)) return problem('A repeat can run for at most a year.');

  const occurrences = expandOccurrences({
    startTime, endTime, daysOfWeek, intervalWeeks, startsOn, endsOn,
    skip: calendar.breaks ?? [],
  });

  if (occurrences.length === 0) {
    return problem('That repeat produces no events. Check the days of the week and the end date.');
  }

  return {
    series: {
      frequency: 'weekly',
      interval_weeks: intervalWeeks,
      days_of_week: daysOfWeek.join(','),
      starts_on: occurrences[0].date,
      ends_on: occurrences.at(-1).date,
      start_of_day: timeOfDay(startTime),
      duration_minutes: durationMinutes(startTime, endTime),
    },
    occurrences,
  };
}

/**
 * Split the occurrences into the ones whose room is free and the dates whose
 * room is not.
 *
 * A booked week is not a reason to refuse a term of meetings. Two bookings that
 * only touch, one ending exactly as the other begins, are not a clash.
 *
 * @param {Array<{date: string, start: string, end: string}>} occurrences
 * @param {Array<{start_time: string, end_time: string}>} busy
 * @returns {{ keep: Array<object>, skipped: string[] }}
 */
export function splitByBusyRoom(occurrences, busy) {
  const keep = [];
  const skipped = [];
  for (const occurrence of occurrences) {
    const clash = busy.some(taken =>
      String(taken.start_time) < occurrence.end && String(taken.end_time) > occurrence.start);
    if (clash) skipped.push(occurrence.date);
    else keep.push(occurrence);
  }
  return { keep, skipped };
}
