import { and, asc, count, eq, gte, isNull } from 'drizzle-orm';
import db from '../client.ts';
import { events, eventInterest } from '../schema/schema.ts';
import { campusStartOfToday } from '../../lib/timezone.js';

/**
 * How many people are interested in each of an RSO's upcoming events.
 *
 * This is the count the removed RSVPs used to give a board, read from the
 * interest that Discord's own controls and the bot's buttons record. Cancelled
 * events are left out, because a board reads this to decide what to expect at
 * the door, and events already held are left out for the same reason.
 */
export async function getInterestByRso(rsoId: number) {
  return db
    .select({
      eventId:       events.eventId,
      title:         events.title,
      startTime:     events.startTime,
      interestCount: count(eventInterest.subject),
    })
    .from(events)
    .leftJoin(eventInterest, eq(eventInterest.eventId, events.eventId))
    .where(and(
      eq(events.rsoId, rsoId),
      gte(events.startTime, campusStartOfToday()),
      isNull(events.cancelledAt),
    ))
    .groupBy(events.eventId)
    .orderBy(asc(events.startTime));
}

/**
 * Somebody means to go.
 *
 * Written so that saying it twice is saying it once: the primary key is the
 * event and the subject, and a second press of the same button lands on the
 * row that is already there. The source is refreshed, because the last place a
 * person said it is the useful one to know.
 */
export async function setInterest(
  { eventId, subject, source }: { eventId: number, subject: string, source: string },
) {
  await db
    .insert(eventInterest)
    .values({ eventId, subject, source })
    .onDuplicateKeyUpdate({ set: { source } });
}

/** They no longer mean to go. Saying so when they never said it is not an error. */
export async function clearInterest({ eventId, subject }: { eventId: number, subject: string }) {
  const [result] = await db
    .delete(eventInterest)
    .where(and(eq(eventInterest.eventId, eventId), eq(eventInterest.subject, subject)));
  return result.affectedRows;
}

/** How many people are interested in one event, which is what a card says. */
export async function countInterest(eventId: number) {
  const rows = await db
    .select({ total: count() })
    .from(eventInterest)
    .where(eq(eventInterest.eventId, eventId));
  return Number(rows[0]?.total ?? 0);
}
