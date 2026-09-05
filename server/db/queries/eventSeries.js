import { and, asc, eq, gt, gte, isNull, lt, ne, or, sql, inArray } from 'drizzle-orm';
import { db } from '../client.ts';
import { eventSeries, events, eventTags, tags, facilityReservations } from '../schema/schema.ts';
import { recordSeriesCreated } from './outbox.ts';

/**
 * The data layer for repeating events.
 *
 * Written with Drizzle, which is the direction the data layer is moving in.
 * A series is a rule row plus one ordinary event row per occurrence, so most of
 * what is here reads or writes the occurrences through their series_id.
 */

/**
 * What already occupies a room in a range of time: other events, and bookings
 * the facilities pollers recorded.
 *
 * A series moving within its own room does not clash with itself, so its own
 * occurrences can be left out.
 *
 * @param {number} locationId
 * @param {string} from wall clock
 * @param {string} to wall clock
 * @param {{ excludeSeriesId?: number }} [options]
 * @returns {Promise<Array<{ start_time: string, end_time: string }>>}
 */
export async function busyInRoom(locationId, from, to, { excludeSeriesId = null } = {}) {
  const ownRows = excludeSeriesId === null
    ? undefined
    : or(isNull(events.seriesId), ne(events.seriesId, excludeSeriesId));

  const [bookedEvents, bookedRooms] = await Promise.all([
    db.select({ start_time: events.startTime, end_time: events.endTime })
      .from(events)
      .where(and(eq(events.locationId, locationId), lt(events.startTime, to), gt(events.endTime, from), isNull(events.cancelledAt), ownRows)),
    db.select({ start_time: facilityReservations.startTime, end_time: facilityReservations.endTime })
      .from(facilityReservations)
      .where(and(
        eq(facilityReservations.locationId, locationId),
        lt(facilityReservations.startTime, to),
        gt(facilityReservations.endTime, from),
      )),
  ]);
  return [...bookedEvents, ...bookedRooms];
}

/**
 * Write a series and every occurrence of it, or none of them.
 *
 * Occurrences are inserted one at a time rather than in one statement, because
 * their identifiers are needed to tag them and a bulk insert reports only the
 * first. Sixteen inserts inside one transaction is a term of weekly meetings.
 *
 * @param {{ series: object, occurrences: Array<{start: string, end: string, external_uid?: string}>,
 *           event: object, tagNames?: string[] }} params
 * @returns {Promise<{ seriesId: number, eventIds: number[] }>}
 */
export async function createSeriesWithOccurrences({ series, occurrences, event, tagNames = [] }) {
  return db.transaction(async tx => {
    const [inserted] = await tx.insert(eventSeries).values({
      rsoId: series.rso_id,
      createdBy: series.created_by,
      frequency: series.frequency,
      intervalWeeks: series.interval_weeks,
      daysOfWeek: series.days_of_week,
      startsOn: series.starts_on,
      endsOn: series.ends_on,
      startOfDay: series.start_of_day,
      durationMinutes: series.duration_minutes,
      externalUid: series.external_uid ?? null,
    });
    const seriesId = inserted.insertId;

    const eventIds = [];
    for (const occurrence of occurrences) {
      const [row] = await tx.insert(events).values({
        rsoId: event.rso_id,
        createdBy: event.created_by,
        locationId: event.location_id ?? null,
        locationText: event.location_text ?? null,
        locationNote: event.location_note ?? null,
        title: event.title,
        description: event.description ?? null,
        startTime: occurrence.start,
        endTime: occurrence.end,
        isPrivate: event.is_private ? 1 : 0,
        externalUid: occurrence.external_uid ?? null,
        seriesId,
      });
      eventIds.push(row.insertId);
    }

    const unique = [...new Set(tagNames)];
    if (unique.length > 0) {
      await tx.insert(tags).values(unique.map(tagName => ({ tagName })))
        .onDuplicateKeyUpdate({ set: { tagName: sql`tag_name` } });
      await tx.insert(eventTags).values(
        eventIds.flatMap(eventId => unique.map(tagName => ({ eventId, tagName })))
      );
    }

    // The Discord bot hears about the repeat from the outbox, and the entry is
    // written inside this transaction, so it exists exactly when the series and
    // its occurrences do.
    await recordSeriesCreated(seriesId, tx);

    return { seriesId, eventIds };
  }, { isolationLevel: 'serializable' });
}

/**
 * One series, or null.
 * @param {number} seriesId
 */
export async function getSeriesById(seriesId) {
  const rows = await db.select().from(eventSeries).where(eq(eventSeries.seriesId, seriesId));
  return rows[0] ?? null;
}

/**
 * The series a set of calendar identifiers already created for an RSO.
 * @param {number} rsoId
 * @param {string[]} uids
 */
export async function findSeriesByUid(rsoId, uids) {
  if (!uids || uids.length === 0) return [];
  return db.select().from(eventSeries)
    .where(and(eq(eventSeries.rsoId, rsoId), inArray(eventSeries.externalUid, uids)));
}

/**
 * The occurrences of a series, in the order they run.
 * @param {number} seriesId
 * @param {{ from?: string }} [scope] only occurrences starting at or after this wall clock
 */
export async function occurrencesOfSeries(seriesId, { from = null } = {}) {
  const where = from
    ? and(eq(events.seriesId, seriesId), gte(events.startTime, from))
    : eq(events.seriesId, seriesId);
  return db.select({
    event_id: events.eventId,
    external_uid: events.externalUid,
    start_time: events.startTime,
    end_time: events.endTime,
    detached: events.detached,
  }).from(events).where(where).orderBy(asc(events.startTime));
}

/**
 * Mark one occurrence as edited on its own, so a later edit to the whole series
 * leaves it where the organizer put it.
 * @param {number} eventId
 */
export async function detachEvent(eventId) {
  const [result] = await db.update(events).set({ detached: 1 }).where(eq(events.eventId, eventId));
  return { affectedRows: result.affectedRows };
}

/**
 * Apply an edit to the occurrences of a series.
 *
 * Each occurrence keeps its own date and takes the new hour and length, so
 * moving a weekly meeting from six to seven moves every week without moving any
 * of them onto another day. Occurrences that were detached are left alone.
 *
 * @param {number} seriesId
 * @param {{ from?: string, fields?: object, startOfDay?: string, durationMinutes?: number }} params
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function applyToSeries(seriesId, { from = null, fields = {}, startOfDay = null, durationMinutes = null }) {
  const updates = {};
  if (fields.title !== undefined)         updates.title = fields.title;
  if (fields.description !== undefined)   updates.description = fields.description;
  if (fields.location_id !== undefined)   updates.locationId = fields.location_id;
  if (fields.location_text !== undefined) updates.locationText = fields.location_text;
  // The note at the door belongs to the repeat as much as the room does. A
  // request that does not mention it leaves it alone, which is why this reads
  // the key rather than the value.
  if (fields.location_note !== undefined) updates.locationNote = fields.location_note;
  if (fields.is_private !== undefined)    updates.isPrivate = fields.is_private ? 1 : 0;

  if (startOfDay && durationMinutes != null) {
    // DATE(start_time) is the occurrence's own day, and it is the same before
    // and after this statement, so the end is derived from it rather than from
    // a start_time that MySQL may already have replaced.
    updates.startTime = sql`TIMESTAMP(DATE(${events.startTime}), ${startOfDay})`;
    updates.endTime   = sql`TIMESTAMP(DATE(${events.startTime}), ${startOfDay}) + INTERVAL ${durationMinutes} MINUTE`;
  }

  if (Object.keys(updates).length === 0) return { affectedRows: 0 };

  const conditions = [eq(events.seriesId, seriesId), eq(events.detached, 0)];
  if (from) conditions.push(gte(events.startTime, from));

  const [result] = await db.update(events).set(updates).where(and(...conditions));
  return { affectedRows: result.affectedRows };
}

/**
 * Replace the tags on the occurrences an edit covers.
 * @param {number[]} eventIds
 * @param {string[]} tagNames
 */
export async function setTagsForEvents(eventIds, tagNames) {
  if (eventIds.length === 0) return;
  await db.delete(eventTags).where(inArray(eventTags.eventId, eventIds));
  const unique = [...new Set(tagNames)];
  if (unique.length === 0) return;
  await db.insert(tags).values(unique.map(tagName => ({ tagName })))
    .onDuplicateKeyUpdate({ set: { tagName: sql`tag_name` } });
  await db.insert(eventTags).values(
    eventIds.flatMap(eventId => unique.map(tagName => ({ eventId, tagName })))
  );
}

/**
 * Remove the occurrences of a series from a date onwards, and end the series
 * before them, so what the rule says and what exists agree.
 *
 * @param {number} seriesId
 * @param {string} from wall clock
 * @returns {Promise<{ affectedRows: number, remaining: number }>}
 */
export async function deleteOccurrencesFrom(seriesId, from) {
  const [result] = await db.delete(events)
    .where(and(eq(events.seriesId, seriesId), gte(events.startTime, from)));

  const remaining = await occurrencesOfSeries(seriesId);
  await syncSeriesEnd(seriesId);
  return { affectedRows: result.affectedRows, remaining: remaining.length };
}

/**
 * Make the rule agree with the occurrences that are left.
 *
 * Deleting one week of a series can leave the stored end date naming a week
 * that no longer exists, and a series with nothing left is a rule for nothing.
 *
 * A series with nothing left is taken away here rather than by the caller, so
 * the answer says whether that happened. The caller has an entry to write for
 * the Discord bot when it did, and the rule cannot be read once it is gone.
 *
 * @param {number} seriesId
 * @returns {Promise<{ affectedRows: number, removed: boolean }>}
 */
export async function syncSeriesEnd(seriesId) {
  const remaining = await occurrencesOfSeries(seriesId);
  if (remaining.length === 0) {
    const { affectedRows } = await deleteSeries(seriesId);
    return { affectedRows, removed: true };
  }
  const [result] = await db.update(eventSeries)
    .set({
      startsOn: String(remaining[0].start_time).slice(0, 10),
      endsOn: String(remaining.at(-1).start_time).slice(0, 10),
    })
    .where(eq(eventSeries.seriesId, seriesId));
  return { affectedRows: result.affectedRows, removed: false };
}

/**
 * Delete a series and, by the foreign key, every occurrence of it.
 * @param {number} seriesId
 */
export async function deleteSeries(seriesId) {
  const [result] = await db.delete(eventSeries).where(eq(eventSeries.seriesId, seriesId));
  return { affectedRows: result.affectedRows };
}

/**
 * Change the rule itself. Used by the importer, which rewrites a series when
 * the calendar it came from changed the rule.
 * @param {number} seriesId
 * @param {object} updates
 */
export async function updateSeriesRule(seriesId, updates) {
  const row = {};
  if (updates.interval_weeks !== undefined)   row.intervalWeeks = updates.interval_weeks;
  if (updates.days_of_week !== undefined)     row.daysOfWeek = updates.days_of_week;
  if (updates.starts_on !== undefined)        row.startsOn = updates.starts_on;
  if (updates.ends_on !== undefined)          row.endsOn = updates.ends_on;
  if (updates.start_of_day !== undefined)     row.startOfDay = updates.start_of_day;
  if (updates.duration_minutes !== undefined) row.durationMinutes = updates.duration_minutes;
  if (Object.keys(row).length === 0) return { affectedRows: 0 };
  const [result] = await db.update(eventSeries).set(row).where(eq(eventSeries.seriesId, seriesId));
  return { affectedRows: result.affectedRows };
}
