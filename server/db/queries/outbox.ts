import { asc, eq, gt, lt, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import db from '../client.ts';
import { courses, eventSeries, events, locations, midterms, outbox } from '../schema/schema.ts';
import { eventSnapshotQuery } from './eventColumns.ts';
import { presentEvent } from '../../lib/eventShape.js';

/**
 * The outbox: what changed, in the order it changed, for the Discord bot.
 *
 * Every change the bot has to hear about writes one entry here, and the bot
 * keeps the identifier it last handled and asks for everything after it. The
 * web platform records nothing about what any reader has read, which is what
 * keeps the endpoint over this table stateless.
 *
 * An entry is written in the same transaction as the change it describes where
 * the code path has one, and immediately after the change where it does not,
 * so that an entry never describes a change that did not happen. That is why
 * there are two ways to write one: on the shared client, and on a connection a
 * caller is already holding a transaction open on.
 */

/** What one entry says. */
export type OutboxEntry = {
  kind: string,
  subjectType: string,
  subjectId: string | number,
  rsoId?: number | null,
  payload: unknown,
};

/**
 * Write an entry.
 *
 * The handle is the shared client unless a caller passes one of its own, which
 * is what a caller inside a Drizzle transaction does so that the entry commits
 * with the change it describes.
 *
 * @returns the identifier of the entry, which is a reader's cursor
 */
export async function writeOutbox(
  { kind, subjectType, subjectId, rsoId = null, payload }: OutboxEntry,
  handle: any = db,
) {
  const [result] = await handle.insert(outbox).values({
    kind,
    subjectType,
    subjectId: String(subjectId),
    rsoId: rsoId ?? null,
    payload,
  });
  return result.insertId;
}

/**
 * Write an entry through a connection somebody else is holding, so that the
 * entry commits or rolls back with the change it describes.
 *
 * A raw insert rather than Drizzle, because the transaction owns the
 * connection and Drizzle's client here is the pool rather than that one
 * connection. The row is the same row writeOutbox writes.
 *
 * @param conn a mysql2 connection with a transaction already open
 */
export async function writeOutboxOnConnection(
  conn: { query: (sql: string, values: unknown[]) => Promise<any> },
  { kind, subjectType, subjectId, rsoId = null, payload }: OutboxEntry,
) {
  const [result] = await conn.query(
    `INSERT INTO Outbox (kind, subject_type, subject_id, rso_id, payload)
     VALUES (?, ?, ?, ?, ?)`,
    [kind, subjectType, String(subjectId), rsoId ?? null, JSON.stringify(payload ?? null)],
  );
  return result.insertId;
}

/**
 * A payload as an object, whichever way the driver handed it back. MySQL
 * parses a JSON column for the caller and MariaDB, where the tests run, hands
 * back the text it stored.
 */
function readPayload(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * The entries after a cursor, in the order they were written.
 * @param after the identifier the reader last handled, zero for the beginning
 */
export async function readOutbox({ after = 0, limit = 100 }: { after?: number, limit?: number } = {}) {
  const rows = await db
    .select({
      outbox_id:    outbox.outboxId,
      kind:         outbox.kind,
      subject_type: outbox.subjectType,
      subject_id:   outbox.subjectId,
      rso_id:       outbox.rsoId,
      payload:      outbox.payload,
      created_at:   outbox.createdAt,
    })
    .from(outbox)
    .where(gt(outbox.outboxId, after))
    .orderBy(asc(outbox.outboxId))
    .limit(limit);
  return rows.map(row => ({ ...row, payload: readPayload(row.payload) }));
}

/**
 * Forget entries past the retention window.
 *
 * A reader further behind than this reconciles from the reading endpoints
 * instead, which is what its health endpoint is for.
 *
 * @param days how many days of entries to keep
 * @returns how many entries were forgotten
 */
export async function pruneOutbox(days: number) {
  // Written into the statement rather than bound, because it is an interval
  // rather than a value, and it is forced to a whole number first so that
  // nothing else can reach the statement.
  const window = Math.max(1, Math.floor(Number(days) || 0));
  const [result] = await db
    .delete(outbox)
    .where(lt(outbox.createdAt, sql`DATE_SUB(NOW(), INTERVAL ${sql.raw(String(window))} DAY)`));
  return result.affectedRows;
}

// ── Snapshots ───────────────────────────────────────────────────────────────

/**
 * The payload of an entry is a snapshot of its subject after the change, in
 * the shape the reading endpoints answer with, so that the bot can post
 * without a second round trip. These read that shape back out of the database
 * after the change rather than assembling it from what the request sent, which
 * is what makes the entry a description of what happened rather than of what
 * was asked for.
 */

/** One event, or null when nothing has that identifier any more. */
export async function eventSnapshot(eventId: number) {
  const rows = await eventSnapshotQuery(eventId);
  return rows[0] ? presentEvent(rows[0]) : null;
}

/**
 * The same snapshot, read on a connection a caller is holding a transaction
 * open on, so that it sees the change that transaction has not committed yet.
 */
export async function eventSnapshotOnConnection(conn: any, eventId: number) {
  const rows = await eventSnapshotQuery(eventId, drizzle(conn));
  return rows[0] ? presentEvent(rows[0]) : null;
}

/** The rule row of a series, in the shape the bot reads it in, or null. */
export async function seriesSnapshot(seriesId: number, handle: any = db) {
  const rows = await handle
    .select({
      series_id:        eventSeries.seriesId,
      rso_id:           eventSeries.rsoId,
      frequency:        eventSeries.frequency,
      interval_weeks:   eventSeries.intervalWeeks,
      days_of_week:     eventSeries.daysOfWeek,
      starts_on:        eventSeries.startsOn,
      ends_on:          eventSeries.endsOn,
      start_of_day:     eventSeries.startOfDay,
      duration_minutes: eventSeries.durationMinutes,
    })
    .from(eventSeries)
    .where(eq(eventSeries.seriesId, seriesId))
    .limit(1);
  return rows[0] ?? null;
}

/** The occurrences a series has, in the order they run. */
export async function seriesEventIds(seriesId: number, handle: any = db) {
  const rows = await handle
    .select({ event_id: events.eventId })
    .from(events)
    .where(eq(events.seriesId, seriesId))
    .orderBy(asc(events.startTime));
  return rows.map(row => row.event_id);
}

/**
 * The names of the fields that differ between two snapshots of one subject.
 *
 * An update carries this beside the snapshot so that a reader can tell a
 * moved event from a renamed one without holding the previous version.
 */
export function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return [];
  return Object.keys(after).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

// ── The writers ─────────────────────────────────────────────────────────────

/**
 * An event was created. Written on the caller's connection, because creating
 * an event runs inside a transaction and the entry belongs to it.
 */
export async function recordEventCreatedOnConnection(conn: any, eventId: number) {
  const event = await eventSnapshotOnConnection(conn, eventId);
  if (!event) return null;
  return writeOutboxOnConnection(conn, {
    kind: 'event.created', subjectType: 'event', subjectId: eventId,
    rsoId: event.rso_id, payload: { event },
  });
}

/** An event was created by something that is not inside a transaction. */
export async function recordEventCreated(eventId: number) {
  const event = await eventSnapshot(eventId);
  if (!event) return null;
  return writeOutbox({
    kind: 'event.created', subjectType: 'event', subjectId: eventId,
    rsoId: event.rso_id, payload: { event },
  });
}

/**
 * An event was changed.
 *
 * The caller passes the event as it stood before, which it already holds
 * because it read the event to decide whether the change was allowed, and the
 * state after is read back here, so the entry names the fields that really
 * differ rather than the fields the request mentioned.
 *
 * A change can carry a reason, which a postponement from Discord does and an
 * ordinary edit does not. The reason belongs to the change rather than to the
 * event, so it lives in the entry and in no column, and it is left out of the
 * payload entirely when there is none.
 *
 * @param before a row in the shape getEventById or the reading queries return
 * @param options reason is what whoever made the change said about it
 */
export async function recordEventUpdated(
  before: Record<string, any>,
  { reason = null }: { reason?: string | null } = {},
) {
  const event = await eventSnapshot(before.event_id);
  if (!event) return null;
  const changed = changedFields(presentEvent(before), event);
  if (changed.length === 0) return null;
  return writeOutbox({
    kind: 'event.updated', subjectType: 'event', subjectId: event.event_id,
    rsoId: event.rso_id, payload: reason ? { event, changed, reason } : { event, changed },
  });
}

/**
 * An event was cancelled. Cancelling is a state rather than a deletion, so the
 * event is still there and the entry carries it with the time on it.
 */
export async function recordEventCancelled(eventId: number) {
  const event = await eventSnapshot(eventId);
  if (!event) return null;
  return writeOutbox({
    kind: 'event.cancelled', subjectType: 'event', subjectId: eventId,
    rsoId: event.rso_id, payload: { event },
  });
}

/**
 * An event was deleted. There is nothing to read back, so the entry carries
 * the event as it last stood, which is what a reader needs to find the
 * announcement it made for it.
 *
 * @param before a row in the shape getEventById or the reading queries return
 */
export async function recordEventDeleted(before: Record<string, any>) {
  const event = presentEvent(before);
  return writeOutbox({
    kind: 'event.deleted', subjectType: 'event', subjectId: event.event_id,
    rsoId: event.rso_id, payload: { event },
  });
}

/**
 * A repeat was created.
 *
 * A term of weekly meetings is one thing that happened, not sixteen, so it
 * leaves one entry carrying the rule and the occurrences it produced. The
 * handle is the transaction the series and its occurrences were written in.
 */
export async function recordSeriesCreated(seriesId: number, handle: any = db) {
  const series = await seriesSnapshot(seriesId, handle);
  if (!series) return null;
  const eventIds = await seriesEventIds(seriesId, handle);
  return writeOutbox({
    kind: 'series.created', subjectType: 'series', subjectId: seriesId,
    rsoId: series.rso_id, payload: { series, event_ids: eventIds },
  }, handle);
}

/**
 * A repeat was changed, whether that means the occurrences were edited or some
 * of them were removed.
 *
 * event_ids are the occurrences the series has now and affected_event_ids are
 * the ones this change reached, so an occurrence that is in the second list
 * and not in the first is one that no longer exists.
 *
 * @param sample one occurrence the change reached, as it stood before, from
 *   which the names of the changed fields are read
 */
export async function recordSeriesUpdated(
  seriesId: number,
  { affectedEventIds = [], sample = null }: { affectedEventIds?: number[], sample?: Record<string, any> | null } = {},
) {
  const series = await seriesSnapshot(seriesId);
  if (!series) return null;
  const eventIds = await seriesEventIds(seriesId);
  const changed = sample ? changedFields(presentEvent(sample), await eventSnapshot(sample.event_id)) : [];
  return writeOutbox({
    kind: 'series.updated', subjectType: 'series', subjectId: seriesId,
    rsoId: series.rso_id,
    payload: { series, event_ids: eventIds, affected_event_ids: affectedEventIds, changed },
  });
}

/**
 * A repeat is gone, with every occurrence of it.
 *
 * The rule row is passed in, because it was read before the deletion and
 * there is nothing left to read now.
 */
export async function recordSeriesDeleted(series: Record<string, any>, affectedEventIds: number[] = []) {
  return writeOutbox({
    kind: 'series.deleted', subjectType: 'series', subjectId: series.series_id,
    rsoId: series.rso_id,
    payload: { series, event_ids: [], affected_event_ids: affectedEventIds },
  });
}

/**
 * One exam, in the shape the midterm listing answers with, or null.
 *
 * The exam schedule belongs to no RSO, so an entry about one carries no
 * rso_id and every reader of the schedule sees it.
 */
export async function midtermSnapshot(midtermId: number) {
  const rows = await db
    .select({
      midterm_id:    midterms.midtermId,
      course_code:   midterms.courseCode,
      course_title:  courses.title,
      title:         midterms.title,
      start_time:    midterms.startTime,
      end_time:      midterms.endTime,
      status:        midterms.status,
      location_text: midterms.locationText,
      building:      locations.building,
      room_number:   locations.roomNumber,
    })
    .from(midterms)
    .innerJoin(courses, eq(courses.courseCode, midterms.courseCode))
    .leftJoin(locations, eq(locations.locationId, midterms.locationId))
    .where(eq(midterms.midtermId, midtermId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The kind a change to an exam belongs to.
 *
 * There is no kind for an exam that was merely written down, because what a
 * reader of the schedule acts on is an exam becoming confirmed or being called
 * off. Everything else, including an edit to an exam that was already
 * confirmed, is an ordinary change.
 */
function midtermKind(before: string | null, after: string) {
  if (after === 'Cancelled' && before !== 'Cancelled') return 'midterm.cancelled';
  if (after === 'Confirmed' && before !== 'Confirmed') return 'midterm.confirmed';
  return 'midterm.updated';
}

/**
 * An exam was written down or changed.
 * @param before the exam as it stood, where there was one, so that the kind
 *   says what the change did rather than only what the exam now is
 */
export async function recordMidtermChanged(midtermId: number, before: Record<string, any> | null = null) {
  const midterm = await midtermSnapshot(midtermId);
  if (!midterm) return null;
  return writeOutbox({
    kind: midtermKind(before?.status ?? null, midterm.status), subjectType: 'midterm', subjectId: midtermId,
    payload: { midterm },
  });
}

/**
 * An exam was taken off the schedule outright.
 *
 * There is no kind of its own for this. A reader has to stop showing the exam,
 * which is what a cancellation asks of it too, and the entry says that the row
 * is gone rather than merely cancelled.
 *
 * @param before the exam as it last stood
 */
export async function recordMidtermDeleted(before: Record<string, any>) {
  return writeOutbox({
    kind: 'midterm.cancelled', subjectType: 'midterm', subjectId: before.midterm_id,
    payload: { midterm: before, deleted: true },
  });
}

/**
 * Somebody's membership of an RSO changed. A role of null means they are no
 * longer a member, which is what a reader needs to take a Discord role away.
 */
export async function recordMembershipChanged(
  { netId, rsoId, role }: { netId: string, rsoId: number, role: string | null },
) {
  return writeOutbox({
    kind: 'membership.changed', subjectType: 'membership', subjectId: `${netId}:${rsoId}`,
    rsoId, payload: { net_id: netId, rso_id: rsoId, role: role ?? null },
  });
}

/**
 * A Discord account was linked to a NetID.
 *
 * The bot learns who somebody is from this and stops asking them to link. The
 * entry belongs to no RSO, because a link is between a person and the platform
 * rather than between a person and one organization.
 */
export async function recordLinkCompleted(
  { discordUserId, netId }: { discordUserId: string, netId: string },
) {
  return writeOutbox({
    kind: 'link.completed', subjectType: 'link', subjectId: discordUserId,
    payload: { discord_user_id: discordUserId, net_id: netId },
  });
}

/**
 * A link was removed, from Discord or from the account page.
 *
 * The bot forgets everything it holds for that account when it reads this,
 * which is why the entry names both sides: the account it holds things under
 * and the person whose data those things were.
 */
export async function recordLinkRevoked(
  { discordUserId, netId }: { discordUserId: string, netId: string },
) {
  return writeOutbox({
    kind: 'link.revoked', subjectType: 'link', subjectId: discordUserId,
    payload: { discord_user_id: discordUserId, net_id: netId },
  });
}
