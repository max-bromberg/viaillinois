import { and, desc, eq, gte, sql, sum } from 'drizzle-orm';
import db from '../client.ts';
import { events, eventViews } from '../schema/schema.ts';

/**
 * How many times an RSO's event pages have been read.
 *
 * A board could already see who said they were interested and what people
 * thought afterwards, and both of those arrive through the Discord bot, so a
 * board whose members are not on Discord read a column of zeros. A view is the
 * one signal the platform collects by itself, from the reading somebody is
 * already doing.
 *
 * Nothing about the reader is recorded anywhere, so these are readings rather
 * than readers: one person opening a page five times is five. That is the
 * crude measure on purpose, because the precise one is bought with a record of
 * who read what.
 */

export type ViewRow = { eventId: number; day: string; viewCount: number };

/** Add these readings to whatever each event and day already has. */
export async function addViews(rows: ViewRow[]) {
  if (rows.length === 0) return;
  await db
    .insert(eventViews)
    .values(rows.map(row => ({
      eventId: row.eventId,
      day: row.day,
      viewCount: row.viewCount,
    })))
    .onDuplicateKeyUpdate({
      set: { viewCount: sql`${eventViews.viewCount} + VALUES(${eventViews.viewCount})` },
    });
}

/**
 * Views per event for one organization, most read first.
 *
 * Cancelled events are kept, unlike the interest listing: a board looking back
 * at how far an announcement travelled is asking about the announcement, and
 * an event that was called off was still read about.
 */
export async function getViewsByRso(rsoId: number, { since = null as string | null } = {}) {
  const window = since ? gte(eventViews.day, since) : undefined;
  return db
    .select({
      eventId:   events.eventId,
      title:     events.title,
      startTime: events.startTime,
      viewCount: sum(eventViews.viewCount).mapWith(Number),
    })
    .from(events)
    .innerJoin(eventViews, eq(eventViews.eventId, events.eventId))
    .where(window ? and(eq(events.rsoId, rsoId), window) : eq(events.rsoId, rsoId))
    .groupBy(events.eventId)
    .orderBy(desc(sum(eventViews.viewCount)));
}

/** Every reading of an organization's events since a day, as one number. */
export async function getViewTotalByRso(rsoId: number, { since = null as string | null } = {}) {
  const window = since ? gte(eventViews.day, since) : undefined;
  const [row] = await db
    .select({ total: sum(eventViews.viewCount).mapWith(Number) })
    .from(eventViews)
    .innerJoin(events, eq(events.eventId, eventViews.eventId))
    .where(window ? and(eq(events.rsoId, rsoId), window) : eq(events.rsoId, rsoId));
  return row?.total ?? 0;
}
