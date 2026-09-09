/**
 * Reading a range of calendar days as a range of instants.
 *
 * A view that shows a stretch of the calendar names it by its first and its
 * last date: the month grid asks for the first and the last of the month, the
 * week view asks for a Sunday and a Saturday, and the scheduler asks for the
 * two ends of the window it searches. Those are days, and a day is a whole day.
 *
 * Compared against a DATETIME column as written, though, "2026-09-30" is
 * midnight that morning, so an upper bound written as a date threw away
 * everything that happened on the day it named. Events sat on the events page
 * and were missing from the last week of the month on the calendar, an event on
 * a Saturday never appeared in the week view at all, and the scheduler weighed a
 * window with its final day empty.
 *
 * A bound that already names a time of day is left exactly as it is, because a
 * caller that wrote one meant it.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The first moment of a day, for a bound written as a date. */
export function startOfDayBound(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return value ?? null;
  return `${value} 00:00:00`;
}

/** The last moment of a day, for a bound written as a date. */
export function endOfDayBound(value) {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return value ?? null;
  return `${value} 23:59:59`;
}

/**
 * Both ends of a range of days, as the instants they cover.
 *
 * @param {string|null|undefined} startDate
 * @param {string|null|undefined} endDate
 * @returns {{ from: string|null, to: string|null }}
 */
export function dayRange(startDate, endDate) {
  return { from: startOfDayBound(startDate), to: endOfDayBound(endDate) };
}
