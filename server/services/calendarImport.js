import { createHash } from 'node:crypto';
import { parseCalendar } from '../lib/ics.js';
import { resolveRoom } from '../lib/locationSearch.js';
import { parseRecurrenceRule, expandOccurrences, timeOfDay, durationMinutes } from '../lib/recurrence.js';
import { termForDate, addDays } from '../lib/academicCalendar.js';
import { allLocations } from '../db/queries/locations.js';
import { findEventsByUid, createEvent, updateEvent, deleteEvent } from '../db/queries/events.js';
import {
  findSeriesByUid, createSeriesWithOccurrences, updateSeriesRule, occurrencesOfSeries,
} from '../db/queries/eventSeries.js';
import { findMidtermsByUid, createMidterm, updateMidterm } from '../db/queries/midterms.js';
import { getCourseCodes } from '../db/queries/courses.js';
import {
  eventSnapshot, midtermSnapshot, recordEventCreated, recordEventUpdated, recordEventDeleted,
  recordMidtermChanged, recordSeriesUpdated,
} from '../db/queries/outbox.ts';

/**
 * Import events from an iCalendar file.
 *
 * Two steps on purpose. planEventImport reads the file and says what it would
 * do; applyEventImport does it. An admin importing a semester of events should
 * see the list before it lands, and the plan is also what makes the feature
 * testable without a database.
 *
 * Re-importing the same file updates what the previous import created, matched
 * on the identifier the calendar gave each entry. Anything entered by hand has
 * no such identifier and is never touched, so an import cannot quietly
 * overwrite someone's work.
 */

/**
 * One request should not be able to ask for unbounded work. A calendar with
 * tens of thousands of entries is a mistake or an attack rather than a
 * semester of events, and a thousand is already far more than any RSO
 * publishes in a year.
 */
const MAX_ENTRIES = 1000;

/**
 * Keep the first entry for each identifier.
 *
 * A file can name the same entry twice. A recurring event with an override
 * carries the parent's identifier alongside a RECURRENCE-ID, and calendar
 * programs export that routinely. Both would be planned as creates and the
 * second insert would violate the unique key partway through a loop that has
 * already written the earlier rows.
 */
function dropDuplicateUids(entries) {
  const seen = new Set();
  const unique = [];
  for (const entry of entries) {
    if (seen.has(entry.uid)) continue;
    seen.add(entry.uid);
    unique.push(entry);
  }
  return { unique, duplicates: entries.length - unique.length };
}

/**
 * The identifier one week of a series carries.
 *
 * A re-import has to land on the week it made last time, and the entry's own
 * identifier belongs to the series, so each occurrence gets the entry's
 * identifier and its date. An entry with a RECURRENCE-ID, which is one week
 * moved or renamed, names the same thing, which is how it lands on the week it
 * stands in for instead of being dropped as a duplicate of the series.
 */
export function occurrenceUid(uid, date) {
  const day = date.slice(0, 10).replace(/-/g, '');
  const joined = `${uid}::${day}`;
  if (joined.length <= 255) return joined;
  // The column holds 255 characters. A calendar with identifiers longer than
  // that still has to produce one stable key per week.
  return `${createHash('sha256').update(uid).digest('hex').slice(0, 32)}::${day}`;
}

/**
 * How a repeating entry expands.
 *
 * A rule that names its own end is taken at its word, up to a year. A rule that
 * never ends stops at the end of the term the entry starts in, because the
 * alternative is an unbounded number of rows.
 *
 * Break weeks are not skipped here, unlike a repeat set up on the form. The
 * file is the organizer's own calendar and it says which dates exist; if their
 * meeting does not run over Thanksgiving, their calendar carries an EXDATE for
 * it, and that is honoured.
 */
function expandEntry(entry) {
  const rule = parseRecurrenceRule(entry.rrule, { startDate: entry.start.slice(0, 10) });
  if (!rule || rule.daysOfWeek.length === 0) return null;

  const startsOn = entry.start.slice(0, 10);
  const term = termForDate(startsOn);
  const endsOn = rule.until ?? (rule.count ? addDays(startsOn, 366) : term.instructionEnd);

  const occurrences = expandOccurrences({
    startTime: entry.start,
    endTime: entry.end,
    daysOfWeek: rule.daysOfWeek,
    intervalWeeks: rule.intervalWeeks,
    startsOn,
    endsOn,
    exclude: entry.exdates,
    count: rule.count,
  });

  if (occurrences.length === 0) return null;

  return {
    rule,
    occurrences,
    recurrence: {
      frequency: 'weekly',
      interval_weeks: rule.intervalWeeks,
      days_of_week: rule.daysOfWeek.join(','),
      starts_on: occurrences[0].date,
      ends_on: occurrences.at(-1).date,
      start_of_day: timeOfDay(entry.start),
      duration_minutes: durationMinutes(entry.start, entry.end),
    },
  };
}

function refuseIfExpandedTooFar(count) {
  if (count > MAX_ENTRIES) {
    throw new Error(
      `That calendar expands to ${count} events, and at most ${MAX_ENTRIES} can be imported at once. ` +
      'Export a narrower date range and import it in parts.'
    );
  }
}

function refuseIfOversized(count) {
  if (count > MAX_ENTRIES) {
    throw new Error(
      `That calendar has ${count} entries, and at most ${MAX_ENTRIES} can be imported at once. ` +
      'Export a narrower date range and import it in parts.'
    );
  }
}

/**
 * Work out what a calendar file would do to an RSO's events.
 *
 * @param {{ics: string, rsoId: number}} params
 * @returns {Promise<{entries: Array<object>, skipped: number}>}
 */
export async function planEventImport({ ics, rsoId }) {
  // A file with entries none of which can be scheduled is a different problem
  // from a file that is not a calendar, and only the second is an error. The
  // first is reported as skipped so the admin can see what was not understood.
  if (!String(ics ?? '').includes('BEGIN:VEVENT')) {
    throw new Error('That file has no calendar entries in it. Expected an .ics calendar file.');
  }
  const all = parseCalendar(ics);
  refuseIfOversized(all.length);

  // An entry standing in for one week of a series is identified by the week it
  // replaces, so it lands on that week rather than looking like a second copy
  // of the series.
  const identified = all.map(entry => (
    entry.recurrenceId ? { ...entry, uid: occurrenceUid(entry.uid, entry.recurrenceId) } : entry
  ));
  const { unique: parsed, duplicates } = dropDuplicateUids(identified);

  const expansions = new Map();
  let totalOccurrences = 0;
  for (const entry of parsed) {
    const expanded = entry.rrule ? expandEntry(entry) : null;
    if (expanded) expansions.set(entry.uid, expanded);
    totalOccurrences += expanded ? expanded.occurrences.length : 1;
  }
  refuseIfExpandedTooFar(totalOccurrences);

  const occurrenceUids = [...expansions.entries()]
    .flatMap(([uid, expanded]) => expanded.occurrences.map(o => occurrenceUid(uid, o.date)));

  const [rooms, existing, existingSeries] = await Promise.all([
    allLocations(),
    findEventsByUid(rsoId, [...parsed.map(entry => entry.uid), ...occurrenceUids]),
    findSeriesByUid(rsoId, [...expansions.keys()]),
  ]);
  const byUid = new Map(existing.map(row => [row.external_uid, row]));
  const seriesByUid = new Map(existingSeries.map(row => [row.externalUid, row]));

  const entries = [];
  let notExpanded = 0;

  for (const entry of parsed) {
    const room = entry.location ? resolveRoom(entry.location, rooms) : null;
    const common = {
      external_uid: entry.uid,
      title: entry.title,
      description: entry.description,
      start: entry.start,
      end: entry.end,
      location_id: room?.location_id ?? null,
      // The original text is kept even when a room was matched, so that a bad
      // match can be seen and corrected rather than having to be guessed at.
      location_text: entry.location,
      location_match: room ? `${room.building} ${room.room_number}` : null,
    };

    const expanded = expansions.get(entry.uid);
    if (!expanded) {
      const already = byUid.get(entry.uid);
      if (entry.rrule) notExpanded += 1;
      entries.push({
        ...common,
        action: already ? 'update' : 'create',
        kind: 'event',
        event_id: already?.event_id ?? null,
        // A rule this importer does not expand, such as a monthly one, is
        // reported rather than quietly imported as one week of a series.
        repeats: entry.rrule ? 'not expanded' : null,
      });
      continue;
    }

    const series = seriesByUid.get(entry.uid) ?? null;
    const held = series ? await occurrencesOfSeries(series.seriesId) : [];
    const heldByUid = new Map(held.map(row => [row.external_uid, row]));

    const rows = expanded.occurrences.map(occurrence => {
      const uid = occurrenceUid(entry.uid, occurrence.date);
      const already = heldByUid.get(uid) ?? byUid.get(uid) ?? null;
      return {
        date: occurrence.date,
        start: occurrence.start,
        end: occurrence.end,
        external_uid: uid,
        action: already ? 'update' : 'create',
        event_id: already?.event_id ?? null,
      };
    });

    const wanted = new Set(rows.map(row => row.external_uid));
    const removes = held.filter(row => !wanted.has(row.external_uid)).map(row => row.event_id);

    // Before rules were expanded, this entry was imported as a single event
    // under the entry's own identifier. Leaving that row where it is would show
    // the first week twice.
    const replaced = byUid.get(entry.uid);

    entries.push({
      ...common,
      action: series ? 'update' : 'create',
      kind: 'series',
      series_id: series?.seriesId ?? null,
      recurrence: expanded.recurrence,
      occurrences: rows.length,
      occurrence_rows: rows,
      creating: rows.filter(row => row.action === 'create').length,
      updating: rows.filter(row => row.action === 'update').length,
      removing: removes.length,
      remove_ids: removes,
      replaces: replaced ? [replaced.event_id] : [],
    });
  }

  return { entries, skipped: countSkipped(ics, all.length), duplicates, notExpanded };
}

/**
 * Entries the parser refused, meaning those with no start time or no title.
 * Reported rather than dropped quietly, so an admin can see that a file was
 * not fully understood.
 */
function countSkipped(ics, imported) {
  const total = (ics.match(/BEGIN:VEVENT/g) || []).length;
  return Math.max(0, total - imported);
}

/**
 * Apply what planEventImport described.
 *
 * @param {{ics: string, rsoId: number, createdBy: string}} params
 * @returns {Promise<{created: number, updated: number, skipped: number}>}
 */
export async function applyEventImport({ ics, rsoId, createdBy }) {
  const plan = await planEventImport({ ics, rsoId });
  let created = 0;
  let updated = 0;
  let removed = 0;
  let seriesCreated = 0;
  let seriesUpdated = 0;

  for (const entry of plan.entries) {
    const row = {
      title: entry.title,
      description: entry.description,
      start_time: entry.start,
      end_time: entry.end,
      location_id: entry.location_id,
      location_text: entry.location_text,
    };

    if (entry.kind !== 'series') {
      if (entry.action === 'update') {
        // Read before the change and compared with the result, so the entry
        // the bot reads names what an import actually altered rather than
        // every field the file happens to carry.
        const before = await eventSnapshot(entry.event_id);
        await updateEvent(entry.event_id, row);
        if (before) await recordEventUpdated(before);
        updated += 1;
      } else {
        const result = await createEvent({
          ...row,
          rso_id: rsoId,
          created_by: createdBy,
          external_uid: entry.external_uid,
          is_private: false,
        });
        await recordEventCreated(result.insertId);
        created += 1;
      }
      continue;
    }

    // The single event an earlier import made for this entry goes, so that the
    // week it stood for is not shown twice. It was announced on its own, so it
    // leaves an entry of its own.
    for (const eventId of entry.replaces) {
      const before = await eventSnapshot(eventId);
      await deleteEvent(eventId);
      if (before) await recordEventDeleted(before);
      removed += 1;
    }

    if (entry.action === 'create') {
      await createSeriesWithOccurrences({
        series: { ...entry.recurrence, rso_id: rsoId, created_by: createdBy, external_uid: entry.external_uid },
        occurrences: entry.occurrence_rows,
        event: {
          rso_id: rsoId, created_by: createdBy,
          location_id: entry.location_id, location_text: entry.location_text,
          title: entry.title, description: entry.description, is_private: false,
        },
      });
      created += entry.occurrence_rows.length;
      seriesCreated += 1;
      continue;
    }

    // A repeat is one thing to the people reading about it, so the weeks this
    // import wrote, changed or removed are gathered and reported together
    // rather than one entry at a time.
    const affected = [];
    for (const occurrence of entry.occurrence_rows) {
      const times = { ...row, start_time: occurrence.start, end_time: occurrence.end };
      if (occurrence.action === 'update') {
        await updateEvent(occurrence.event_id, times);
        affected.push(occurrence.event_id);
        updated += 1;
      } else {
        const result = await createEvent({
          ...times,
          rso_id: rsoId,
          created_by: createdBy,
          external_uid: occurrence.external_uid,
          series_id: entry.series_id,
          is_private: false,
        });
        affected.push(result.insertId);
        created += 1;
      }
    }

    // A week the rule no longer holds is a week the organizer removed.
    for (const eventId of entry.remove_ids) {
      await deleteEvent(eventId);
      affected.push(eventId);
      removed += 1;
    }

    await updateSeriesRule(entry.series_id, entry.recurrence);
    await recordSeriesUpdated(entry.series_id, { affectedEventIds: affected });
    seriesUpdated += 1;
  }

  return {
    created, updated, removed,
    series_created: seriesCreated,
    series_updated: seriesUpdated,
    skipped: plan.skipped,
    duplicates: plan.duplicates,
    notExpanded: plan.notExpanded,
  };
}

// ── Midterms ────────────────────────────────────────────────────────────────

/**
 * HKN publishes one calendar covering every course, so which course a midterm
 * belongs to has to be read out of the entry's title. Titles in the wild look
 * like "ECE 210 Midterm 1", "ECE220 Exam 2" and "Midterm 1 for CS 225", so the
 * code is looked for anywhere in the title, with or without the space.
 *
 * Only codes VIA already has a course row for are accepted. Inventing courses
 * from a title would fill the course list with typos.
 */
export function findCourseCode(title, knownCodes) {
  const compact = new Map(knownCodes.map(code => [code.replace(/\s+/g, '').toUpperCase(), code]));
  for (const match of String(title ?? '').toUpperCase().matchAll(/\b([A-Z]{2,4})\s?(\d{3})\b/g)) {
    const found = compact.get(`${match[1]}${match[2]}`);
    if (found) return found;
  }
  return null;
}

/**
 * Work out what a calendar file would do to the midterm listing.
 *
 * @param {{ics: string}} params
 * @returns {Promise<{entries: Array<object>, skipped: number, unmatched: string[]}>}
 */
export async function planMidtermImport({ ics }) {
  if (!String(ics ?? '').includes('BEGIN:VEVENT')) {
    throw new Error('That file has no calendar entries in it. Expected an .ics calendar file.');
  }
  const all = parseCalendar(ics);
  refuseIfOversized(all.length);
  const { unique: parsed, duplicates } = dropDuplicateUids(all);

  const [rooms, codes] = await Promise.all([allLocations(), getCourseCodes()]);
  const existing = await findMidtermsByUid(parsed.map(entry => entry.uid));
  const byUid = new Map(existing.map(row => [row.external_uid, row]));

  const entries = [];
  const unmatched = [];

  for (const entry of parsed) {
    const courseCode = findCourseCode(entry.title, codes);
    if (!courseCode) {
      unmatched.push(entry.title);
      continue;
    }
    const room = entry.location ? resolveRoom(entry.location, rooms) : null;
    const already = byUid.get(entry.uid);
    entries.push({
      action: already ? 'update' : 'create',
      midterm_id: already?.midterm_id ?? null,
      external_uid: entry.uid,
      course_code: courseCode,
      title: entry.title,
      start: entry.start,
      end: entry.end,
      location_id: room?.location_id ?? null,
      location_text: entry.location,
      location_match: room ? `${room.building} ${room.room_number}` : null,
    });
  }

  return { entries, skipped: countSkipped(ics, all.length), duplicates, unmatched };
}

/**
 * Apply what planMidtermImport described.
 *
 * What HKN publishes is taken as settled, so imported midterms are Confirmed
 * rather than Pending. Pending exists for the ones a student typed in, which
 * an admin still reviews.
 *
 * @param {{ics: string}} params
 * @returns {Promise<{created: number, updated: number, skipped: number, unmatched: string[]}>}
 */
export async function applyMidtermImport({ ics }) {
  const plan = await planMidtermImport({ ics });
  let created = 0;
  let updated = 0;

  for (const entry of plan.entries) {
    const row = {
      course_code: entry.course_code,
      title: entry.title,
      start_time: entry.start,
      end_time: entry.end,
      location_id: entry.location_id,
      location_text: entry.location_text,
    };

    if (entry.action === 'update') {
      // Status is deliberately absent. An admin may have cancelled this
      // midterm, and re-importing the same file should not quietly undo that.
      const before = await midtermSnapshot(entry.midterm_id);
      await updateMidterm(entry.midterm_id, row);
      await recordMidtermChanged(entry.midterm_id, before);
      updated += 1;
    } else {
      const result = await createMidterm({
        ...row, status: 'Confirmed', submitted_by: null, external_uid: entry.external_uid,
      });
      await recordMidtermChanged(result.insertId);
      created += 1;
    }
  }

  return { created, updated, skipped: plan.skipped, duplicates: plan.duplicates, unmatched: plan.unmatched };
}
