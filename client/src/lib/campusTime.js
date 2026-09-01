/**
 * Campus time.
 *
 * VIA serves one campus, so every time it shows is that campus's time. Rendered
 * with the browser's own zone, the same event showed one hour to a student in a
 * lecture hall and another to the same student reading it from home over the
 * winter break, with nothing on the page to say which was the hour to turn up
 * at. Everything here renders on the campus clock instead, so the answer is the
 * same wherever it is read.
 *
 * The API sends each time with the campus offset already on it, which names an
 * instant. A bare wall clock reading is still accepted, from a form field or an
 * import preview, and is read as campus time, because that is what it is.
 */

export const CAMPUS_TIME_ZONE = 'America/Chicago';

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Some builds separate the hour from AM or PM with a narrow space. */
const tidy = text => text.replace(/[  ]/g, ' ');

/** How far campus time is from UTC at a given instant, in minutes. */
function offsetMinutesAt(instant) {
  const f = fieldsOf(instant);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return (asUtc - instant.getTime()) / 60000;
}

function fieldsOf(instant) {
  const parts = FIELD_FORMAT.formatToParts(instant)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return {
    year:   Number(parts.year),
    month:  Number(parts.month),
    day:    Number(parts.day),
    // Under hour12: false, midnight is reported as hour 24.
    hour:   Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * Read a stored or published time as the instant it names.
 *
 * @param {string|Date|null|undefined} value
 * @returns {Date|null}
 */
export function toInstant(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value);
  const bare = WALL_CLOCK.exec(text);
  if (bare) {
    // A wall clock reading with no zone is campus time. Its offset depends on
    // the instant and the instant depends on the offset, so one guess and one
    // correction settle it, everywhere except inside the hour that does not
    // exist on the spring forward day.
    const [, y, mo, d, h, mi, s] = bare;
    const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
    const offset = offsetMinutesAt(new Date(guess - offsetMinutesAt(new Date(guess)) * 60000));
    return new Date(guess - offset * 60000);
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function render(value, options) {
  const instant = toInstant(value);
  if (!instant) return '';
  return tidy(new Intl.DateTimeFormat('en-US', { timeZone: CAMPUS_TIME_ZONE, ...options }).format(instant));
}

/**
 * The date on campus.
 * @param {string|Date|null} value
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function campusDate(value, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return render(value, options);
}

/**
 * The time of day on campus.
 * @param {string|Date|null} value
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function campusTime(value, options = { hour: 'numeric', minute: '2-digit' }) {
  return render(value, options);
}

/**
 * The date and the time of day on campus, in one line.
 * @param {string|Date|null} value
 * @param {{ date?: Intl.DateTimeFormatOptions, time?: Intl.DateTimeFormatOptions, separator?: string }} [options]
 */
export function campusDateTime(value, options = {}) {
  const { date, time, separator = ' at ' } = options;
  const day = campusDate(value, date ?? { weekday: 'short', month: 'short', day: 'numeric' });
  if (!day) return '';
  return `${day}${separator}${campusTime(value, time ?? { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * The campus clock fields of a time, for laying one out on a grid.
 * @param {string|Date|null} value
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number }|null}
 */
export function campusFields(value) {
  const instant = toInstant(value);
  return instant ? fieldsOf(instant) : null;
}

/**
 * The campus date of a time, as YYYY-MM-DD.
 * @param {string|Date|null} value
 * @returns {string}
 */
export function campusStartOfDay(value) {
  // A plain date already names a day. Reading it as an instant would make it
  // UTC midnight, which is the previous day on campus.
  if (typeof value === 'string' && DATE_ONLY.test(value)) return value;
  const f = campusFields(value);
  if (!f) return '';
  return `${f.year}-${String(f.month).padStart(2, '0')}-${String(f.day).padStart(2, '0')}`;
}

/** Today on campus, as YYYY-MM-DD. */
export function campusToday() {
  return campusStartOfDay(new Date());
}

/** Whether two times fall on the same day on campus. */
export function isSameCampusDay(a, b) {
  const left = campusStartOfDay(a);
  return left !== '' && left === campusStartOfDay(b);
}

/**
 * The value a datetime-local input needs, as campus wall clock.
 *
 * An edit form has to be filled with the hour the organizer typed. Filled from
 * the reader's own zone instead, saving a form nobody touched moved the event.
 *
 * @param {string|Date|null} value
 * @returns {string} YYYY-MM-DDTHH:MM
 */
export function toDateTimeLocal(value) {
  const f = campusFields(value);
  if (!f) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${f.year}-${pad(f.month)}-${pad(f.day)}T${pad(f.hour)}:${pad(f.minute)}`;
}

/**
 * A calendar column stands for a day, not for an instant.
 *
 * Days are carried as a Date at local midnight, because that is what the day
 * arithmetic in the calendar views works in. Reading one back through a
 * timezone would slide it to the day before for every reader west of UTC, so
 * it is read by its calendar fields instead.
 *
 * @param {Date} marker
 * @returns {string} YYYY-MM-DD
 */
export function calendarDayKey(marker) {
  if (!(marker instanceof Date) || Number.isNaN(marker.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${marker.getFullYear()}-${pad(marker.getMonth() + 1)}-${pad(marker.getDate())}`;
}

/** A day marker standing for today on campus. */
export function campusTodayMarker() {
  const f = campusFields(new Date());
  return new Date(f.year, f.month - 1, f.day);
}

/** Whether a time falls on the campus day a calendar column stands for. */
export function fallsOnDay(value, marker) {
  const day = campusStartOfDay(value);
  return day !== '' && day === calendarDayKey(marker);
}
