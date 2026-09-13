import { campusFields, campusStartOfDay, toInstant } from './campusTime.js';

/**
 * What the greeting says, worked out from what the page already knows.
 *
 * docs/design/08-surfaces.md: under the greeting, one line of numerals. Tonight's
 * count in signal, this week's count, and the days to the next midterm. Signed
 * in, the counts are for the organizations the reader follows.
 *
 * None of this is a new request to the platform beyond the two the feed already
 * has to make, and none of it is a number the client invents: a count the page
 * does not know is left out rather than shown as a zero.
 */

/** The first name of whoever is signed in, or nothing. */
export function firstName(user) {
  const full = user?.full_name ?? '';
  const first = String(full).trim().split(/\s+/)[0];
  return first === '' ? null : first;
}

/** The campus day, as YYYY-MM-DD, a number of days from now. */
function dayFrom(now, days) {
  const fields = campusFields(now);
  if (!fields) return '';
  const marker = new Date(Date.UTC(fields.year, fields.month - 1, fields.day + days));
  const pad = value => String(value).padStart(2, '0');
  return `${marker.getUTCFullYear()}-${pad(marker.getUTCMonth() + 1)}-${pad(marker.getUTCDate())}`;
}

/**
 * The counts, from one page of upcoming events and the confirmed midterms.
 *
 * @param {{ events?: Array, midterms?: Array, now?: Date|string, where?: string }} what
 * @returns {{ tonight: number|null, week: number|null, midterm: { days: number, course: string }|null }}
 */
export function greetingCounts({ events = [], midterms = [], now = new Date(), where = 'ECEB' } = {}) {
  const today = campusStartOfDay(now);
  const inSevenDays = dayFrom(now, 7);

  const onToday = events.filter(event => campusStartOfDay(event.start_time) === today);
  const tonight = onToday.filter(event => {
    if (!where) return true;
    // Tonight's count names the building it is counting, so it counts that
    // building rather than every event on campus.
    return (event.building ?? '') === where;
  }).length;

  const week = events.filter(event => {
    const day = campusStartOfDay(event.start_time);
    return day >= today && day < inSevenDays;
  }).length;

  const next = midterms
    .filter(exam => campusStartOfDay(exam.start_time) >= today)
    .sort((a, b) => (toInstant(a.start_time) ?? 0) - (toInstant(b.start_time) ?? 0))[0];

  return {
    tonight: onToday.length === 0 ? null : tonight,
    week: events.length === 0 ? null : week,
    midterm: next
      ? {
          days: Math.max(0, Math.round(
            (Date.parse(`${campusStartOfDay(next.start_time)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
          )),
          course: next.course_code ?? '',
        }
      : null,
  };
}
