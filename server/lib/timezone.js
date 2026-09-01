/**
 * Campus local time.
 *
 * Event times are stored as wall clock with no zone, because that is what the
 * organizer typed and what people read on the page. Anything published for a
 * machine, a sitemap entry or an Event listing that search engines and
 * assistants read, has to carry the offset. Without it the value is ambiguous
 * by an hour twice a year, and six hours out to anything that assumes UTC.
 */

export const CAMPUS_TIME_ZONE = 'America/Chicago';

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** How far campus time is from UTC at a given instant, in minutes. */
function offsetMinutesAt(instant) {
  const parts = FORMATTER.formatToParts(instant)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
  );
  return (asUtc - instant.getTime()) / 60000;
}

const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');

/** The campus wall clock reading of an instant, field by field. */
function campusParts(instant) {
  const parts = FORMATTER.formatToParts(instant)
    .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  // Intl reports midnight as hour 24 of the previous day under hour12: false.
  return { ...parts, hour: parts.hour === '24' ? '00' : parts.hour };
}

/**
 * Read an instant as campus wall clock, in the shape MySQL stores and compares.
 *
 * @param {Date} instant
 * @returns {string} YYYY-MM-DD HH:MM:SS
 */
export function toCampusWallClock(instant) {
  const { year, month, day, hour, minute, second } = campusParts(instant);
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * The current campus wall clock.
 *
 * Stored times are campus wall clock, so a comparison against the present has
 * to be made against this rather than against the database's NOW(). MySQL runs
 * in whatever zone its container was started in, and comparing that against a
 * campus wall clock is out by five or six hours.
 *
 * @param {Date} [instant]
 * @returns {string} YYYY-MM-DD HH:MM:SS
 */
export function campusNow(instant = new Date()) {
  return toCampusWallClock(instant);
}

/**
 * Midnight at the start of the campus day that is currently underway.
 *
 * @param {Date} [instant]
 * @returns {string} YYYY-MM-DD 00:00:00
 */
export function campusStartOfToday(instant = new Date()) {
  const { year, month, day } = campusParts(instant);
  return `${year}-${month}-${day} 00:00:00`;
}

function formatOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  return `${sign}${pad(minutes / 60)}:${pad(minutes % 60)}`;
}

/**
 * Render a stored event time as ISO 8601 with the campus offset.
 *
 * @param {string|Date|null} value wall clock, as stored, or a Date
 * @returns {string|null}
 */
export function toIsoWithOffset(value) {
  if (value == null) return null;

  let wallClock;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    wallClock = toCampusWallClock(value);
  } else {
    wallClock = String(value).replace('T', ' ').slice(0, 19);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(wallClock);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);

  // The offset depends on the instant, and the instant depends on the offset.
  // One guess and one correction settles it everywhere except inside the hour
  // that does not exist on the spring forward day.
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let offset = offsetMinutesAt(new Date(guess));
  offset = offsetMinutesAt(new Date(guess - offset * 60000));

  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
  return `${iso}${formatOffset(offset)}`;
}
