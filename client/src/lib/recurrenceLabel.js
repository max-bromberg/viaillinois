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

function describe({ intervalWeeks, days, endsOn }) {
  const named = spokenList(days.map(day => FULL_DAYS[day] ?? day));
  if (!named) return '';
  const when = intervalWeeks === 2
    ? `every other ${named}`
    : intervalWeeks > 2
      ? `every ${intervalWeeks} weeks on ${named}`
      : `every ${named}`;
  const until = readableDay(endsOn);
  return until ? `Repeats ${when} until ${until}` : `Repeats ${when}`;
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
  return describe({
    intervalWeeks: Number(event.series_interval_weeks ?? 1),
    days: String(event.series_days_of_week ?? '').split(',').filter(Boolean),
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
  return describe({
    intervalWeeks: Number(recurrence.interval_weeks ?? 1),
    days: recurrence.days_of_week ?? [],
    endsOn: recurrence.ends_on,
  });
}
