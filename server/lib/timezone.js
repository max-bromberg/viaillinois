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
    const parts = FORMATTER.formatToParts(value)
      .reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    const hour = parts.hour === '24' ? '00' : parts.hour;
    wallClock = `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
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
