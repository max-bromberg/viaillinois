import { createHash } from 'node:crypto';

/**
 * A small iCalendar reader, covering the part of RFC 5545 that a published
 * calendar actually uses: VEVENT entries with a summary, a time range, a
 * location and a description.
 *
 * Written here rather than taken from a package because the useful subset is
 * small, the failure modes are ones we want to choose ourselves (an entry that
 * cannot be scheduled is skipped rather than imported at a wrong time), and a
 * calendar file is untrusted input that arrives from outside the university.
 *
 * Repeating entries are read but not expanded here. The rule is carried out as
 * it was written, along with the dates it excludes and, for an entry that
 * stands in for one week of a series, the date it replaces. Turning a rule into
 * dates is lib/recurrence.js, which the importer uses, so that this file stays
 * a reader of files.
 */

/** Events are in Champaign, and VIA stores wall clock time with no zone. */
const TIME_ZONE = 'America/Chicago';

/**
 * Undo line folding. A long line is split with each continuation beginning
 * with a space or a tab, and the break plus that one character disappear.
 */
function unfold(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

/**
 * Reverse the escaping RFC 5545 applies to text values.
 *
 * One pass, not a series of replacements. Done as a series, an escaped
 * backslash followed by the letter n turns into a line break, when what the
 * author wrote was a backslash and an n.
 */
function unescapeText(value) {
  return value.replace(/\\([nN,;\\])/g, (_, character) =>
    (character === 'n' || character === 'N') ? '\n' : character
  );
}

/** Split "NAME;PARAM=X:value" into its three parts. */
function parseLine(line) {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const [name, ...params] = head.split(';');
  return { name: name.toUpperCase(), params, value };
}

const pad = n => String(n).padStart(2, '0');

const asDateTime = (y, mo, d, h, mi, s) =>
  `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}`;

/**
 * Read a UTC stamp and express it as Champaign wall clock time, so that a
 * calendar published in UTC lands at the hour people will turn up.
 */
function utcToLocal(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  // Intl renders midnight as hour 24 in this locale.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}

/**
 * Read a DTSTART or DTEND value.
 *
 * A value ending in Z is UTC and gets converted. Anything else, whether it
 * names a timezone or floats without one, is taken as the local wall clock
 * already, which is what a calendar published for a campus audience means.
 */
function parseDate(value, params) {
  const isDateOnly = params.some(p => p.toUpperCase() === 'VALUE=DATE') || /^\d{8}$/.test(value);
  if (isDateOnly) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
    return m ? { at: asDateTime(m[1], m[2], m[3], 0, 0, 0), dateOnly: true } : null;
  }

  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, zulu] = m;

  if (zulu) {
    const utc = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
    return { at: utcToLocal(utc), dateOnly: false };
  }
  return { at: asDateTime(y, mo, d, h, mi, s), dateOnly: false };
}

/** Add whole minutes to a "YYYY-MM-DD HH:MM:SS" string. */
function addMinutes(at, minutes) {
  const [date, time] = at.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  const shifted = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes, s));
  return asDateTime(
    shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(),
    shifted.getUTCHours(), shifted.getUTCMinutes(), shifted.getUTCSeconds()
  );
}

/**
 * An entry with no UID still has to be recognisable on a second import, or
 * every re-import would duplicate it. Its own content is the next best key.
 */
function syntheticUid(entry) {
  const digest = createHash('sha256')
    .update(`${entry.title}|${entry.start}|${entry.end}|${entry.location}`)
    .digest('hex')
    .slice(0, 32);
  return `via-generated-${digest}`;
}

/**
 * Read the events out of an iCalendar file.
 *
 * Entries that cannot be scheduled or shown, meaning those with no start time
 * or no title, are skipped rather than imported as something wrong.
 *
 * @param {string} text the contents of an .ics file
 * @returns {Array<{uid: string, title: string, description: string|null,
 *                  location: string|null, start: string, end: string, allDay: boolean}>}
 */
export function parseCalendar(text) {
  if (typeof text !== 'string' || !text.includes('BEGIN:VEVENT')) return [];

  const entries = [];
  let current = null;
  let depth = 0;

  for (const line of unfold(text).split('\n')) {
    const parsed = parseLine(line.trim());
    if (!parsed) continue;
    const { name, params, value } = parsed;

    if (name === 'BEGIN' && value === 'VEVENT') {
      current = {
        uid: null, title: null, description: null, location: null,
        start: null, end: null, allDay: false,
        rrule: null, exdates: [], recurrenceId: null,
      };
      depth = 0;
      continue;
    }
    if (!current) continue;

    // A VEVENT can contain a VALARM. Its properties are not the event's.
    if (name === 'BEGIN') { depth += 1; continue; }
    if (name === 'END' && value !== 'VEVENT') { depth -= 1; continue; }
    if (depth > 0) continue;

    if (name === 'END' && value === 'VEVENT') {
      if (current.start && current.title) {
        // An end that is missing, equal to the start, or before it cannot be
        // stored: the database requires end_time to be after start_time, and
        // an import that violated it would fail partway through. All three
        // happen in real files, the last because an all day DTEND is
        // exclusive and a single day is often written with the same date twice.
        if (!current.end || current.end <= current.start) {
          current.end = current.allDay
            ? addMinutes(current.start, 24 * 60 - 1)
            : addMinutes(current.start, 60);
        }
        if (!current.uid) current.uid = syntheticUid(current);
        entries.push(current);
      }
      current = null;
      continue;
    }

    switch (name) {
      case 'UID':         current.uid = value.trim(); break;
      case 'SUMMARY':     current.title = unescapeText(value).trim() || null; break;
      case 'DESCRIPTION': current.description = unescapeText(value).trim() || null; break;
      case 'LOCATION':    current.location = unescapeText(value).trim() || null; break;
      case 'DTSTART': {
        const parsedDate = parseDate(value.trim(), params);
        if (parsedDate) {
          current.start = parsedDate.at;
          current.allDay = parsedDate.dateOnly;
        }
        break;
      }
      case 'RRULE': current.rrule = value.trim() || null; break;
      // A repeating entry can carry several of these, and each can list several
      // dates, so they accumulate rather than replace.
      case 'EXDATE': {
        for (const one of value.split(',')) {
          const parsed = parseDate(one.trim(), params);
          if (parsed) current.exdates.push(parsed.at);
        }
        break;
      }
      case 'RECURRENCE-ID': {
        const parsed = parseDate(value.trim(), params);
        if (parsed) current.recurrenceId = parsed.at;
        break;
      }
      case 'DTEND': {
        const parsedDate = parseDate(value.trim(), params);
        if (parsedDate) {
          // An all day end date is exclusive, so it names the morning after.
          current.end = parsedDate.dateOnly
            ? addMinutes(parsedDate.at, -1)
            : parsedDate.at;
        }
        break;
      }
      default: break;
    }
  }

  return entries;
}
