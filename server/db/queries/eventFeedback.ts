import { and, asc, avg, count, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm';
import db from '../client.ts';
import { events, eventFeedback } from '../schema/schema.ts';
import { campusStartOfToday } from '../../lib/timezone.js';

/**
 * What people thought of an event, and what a board is shown of it.
 *
 * One rating per person per event, so the primary key is the event and the
 * NetID and a second submission replaces the first rather than counting twice.
 * A board reads the average, how many people rated, and the comments, and it
 * never reads who gave which rating: a small RSO would otherwise be able to
 * work out from four ratings who was unhappy, and nobody would say anything
 * true again.
 */

/** How far back a board is shown feedback for, in days. */
const RECENT_DAYS = 30;

/** A rating, with a comment or without one, replacing whatever stood before. */
export async function saveFeedback(
  { eventId, netId, rating, comment = null }:
  { eventId: number, netId: string, rating: number, comment?: string | null },
) {
  await db
    .insert(eventFeedback)
    .values({ eventId, netId, rating, comment })
    .onDuplicateKeyUpdate({ set: { rating, comment } });
}

/** The window a board reads: what has just happened, and what is still to come. */
function recentAndUpcoming() {
  return sql`DATE_SUB(${campusStartOfToday()}, INTERVAL ${sql.raw(String(RECENT_DAYS))} DAY)`;
}

/**
 * Per event, the average rating, how many people gave one, and the comments.
 *
 * Events that were cancelled are left out, and so is anything older than the
 * window, because this is read to decide what to do next rather than to keep a
 * record. An event nobody rated is still listed, with no average and a count
 * of zero, so that the board can see the silence as well as the applause.
 */
export async function getFeedbackByRso(rsoId: number) {
  const totals = await db
    .select({
      eventId:   events.eventId,
      title:     events.title,
      startTime: events.startTime,
      average:   avg(eventFeedback.rating),
      ratings:   count(eventFeedback.rating),
    })
    .from(events)
    .leftJoin(eventFeedback, eq(eventFeedback.eventId, events.eventId))
    .where(and(
      eq(events.rsoId, rsoId),
      gte(events.startTime, recentAndUpcoming()),
      isNull(events.cancelledAt),
    ))
    .groupBy(events.eventId)
    .orderBy(asc(events.startTime));

  const comments = await db
    .select({ eventId: eventFeedback.eventId, comment: eventFeedback.comment })
    .from(eventFeedback)
    .innerJoin(events, eq(events.eventId, eventFeedback.eventId))
    .where(and(
      eq(events.rsoId, rsoId),
      gte(events.startTime, recentAndUpcoming()),
      isNull(events.cancelledAt),
      isNotNull(eventFeedback.comment),
    ))
    .orderBy(asc(eventFeedback.createdAt));

  return totals.map(row => ({
    eventId:   row.eventId,
    title:     row.title,
    startTime: row.startTime,
    // MySQL gives an average back as a decimal string, and no ratings gives
    // null rather than zero, which is the honest answer to "how did it go".
    average:   Number(row.ratings) === 0 ? null : Math.round(Number(row.average) * 100) / 100,
    ratings:   Number(row.ratings),
    comments:  comments.filter(one => one.eventId === row.eventId).map(one => one.comment),
  }));
}
