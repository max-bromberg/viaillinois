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
