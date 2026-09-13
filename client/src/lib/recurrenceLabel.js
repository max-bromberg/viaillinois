/**
 * Saying what a repeat means, in the words a person would use.
 *
 * The dates here are days rather than instants. Reading one through a timezone
 * would move it to the day before for every reader west of UTC, which for the
 * last date of a series is the difference between naming a day it runs on and
 * naming one it does not.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const FULL_DAYS = {
  Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday',
  Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

/** A stored date as the day it names. */
function readableDay(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''));
  if (!match) return '';
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

/** A list of days the way somebody would say it out loud. */
function spokenList(items) {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** Positions in a month, as somebody would say them out loud. */
const POSITIONS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last' };

/**
 * A date of the month with its ending on it, so that a sentence reads as one
 * somebody would say rather than as a number in the middle of words.
 */
function ordinal(day) {
  const number = Number(day);
  if (!Number.isInteger(number)) return '';
  const tens = number % 100;
  if (tens >= 11 && tens <= 13) return `${number}th`;
  return `${number}${({ 1: 'st', 2: 'nd', 3: 'rd' })[number % 10] ?? 'th'}`;
}

function untilPart(endsOn) {
  const until = readableDay(endsOn);
  return until ? ` until ${until}` : '';
}

function describeWeekly({ intervalWeeks, days, endsOn }) {
  const named = spokenList(days.map(day => FULL_DAYS[day] ?? day));
  if (!named) return '';
  const when = intervalWeeks === 2
    ? `every other ${named}`
    : intervalWeeks > 2
      ? `every ${intervalWeeks} weeks on ${named}`
      : `every ${named}`;
  return `Repeats ${when}${untilPart(endsOn)}`;
}

/**
 * A monthly repeat, in whichever of its two shapes it was written: a date in
 * the month, or a weekday of it.
 */
function describeMonthly({ intervalMonths, monthDay, monthWeek, days, endsOn }) {
  const every = intervalMonths > 1 ? `every ${intervalMonths} months` : 'each month';

  if (monthDay != null) {
    const date = ordinal(monthDay);
    if (!date) return '';
    return `Repeats on the ${date} of ${every}${untilPart(endsOn)}`;
  }

  const position = POSITIONS[String(monthWeek)];
  const weekday = FULL_DAYS[days[0]] ?? days[0];
  if (!position || !weekday) return '';
  return `Repeats on the ${position} ${weekday} of ${every}${untilPart(endsOn)}`;
}

/**
 * A set of dates the organizer picked. There is no rule to say out loud, so the
 * sentence says that, and names the last of them, which is the thing a reader
 * of a series wants to know.
 */
function describePickedDates({ count, endsOn }) {
  const last = readableDay(endsOn);
  const many = count > 0 ? `${count} dates` : 'dates';
  const tail = last ? `, the last on ${last}` : '';
  return `Repeats on ${many} chosen one by one${tail}`;
}

/**
 * What an event's series says, for a page showing that event.
 *
 * @param {{ series_id?: number, series_interval_weeks?: number,
 *           series_days_of_week?: string, series_ends_on?: string }|null} event
 * @returns {string} empty when the event does not repeat
 */
export function recurrenceLabel(event) {
  if (!event?.series_id) return '';
  const days = String(event.series_days_of_week ?? '').split(',').filter(Boolean);

  if (event.series_frequency === 'dates') {
    return describePickedDates({ count: 0, endsOn: event.series_ends_on });
  }
  if (event.series_frequency === 'monthly') {
    return describeMonthly({
      intervalMonths: Number(event.series_interval_months ?? 1),
      monthDay: event.series_month_day ?? null,
      monthWeek: event.series_month_week ?? null,
      days,
      endsOn: event.series_ends_on,
    });
  }
  return describeWeekly({
    intervalWeeks: Number(event.series_interval_weeks ?? 1),
    days,
    endsOn: event.series_ends_on,
  });
}

/**
 * The same sentence for a repeat described on a form, which has no series to
 * read it off yet.
 *
 * @param {{ interval_weeks?: number, days_of_week?: string[], ends_on?: string }|null} recurrence
 * @returns {string}
 */
export function repeatSummary(recurrence) {
  if (!recurrence) return '';

  if (recurrence.frequency === 'dates') {
    const picked = [...(recurrence.dates ?? [])].sort();
    if (picked.length === 0) return '';
    return describePickedDates({ count: picked.length, endsOn: picked.at(-1) });
  }
  if (recurrence.frequency === 'monthly') {
    return describeMonthly({
      intervalMonths: Number(recurrence.interval_months ?? 1),
      monthDay: recurrence.month_day ?? null,
      monthWeek: recurrence.month_week ?? null,
      days: recurrence.days_of_week ?? [],
      endsOn: recurrence.ends_on,
    });
  }
  return describeWeekly({
    intervalWeeks: Number(recurrence.interval_weeks ?? 1),
    days: recurrence.days_of_week ?? [],
    endsOn: recurrence.ends_on,
  });
}
