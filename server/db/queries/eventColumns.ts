import { eq, sql } from 'drizzle-orm';
import db from '../client.ts';
import { eventSeries, events, locations, rsOs } from '../schema/schema.ts';

/**
 * The shape every event leaves the internal service API in.
 *
 * It lives on its own because two callers need exactly the same shape: the
 * reading endpoints, which answer the bot's questions, and the outbox, whose
 * entries carry a snapshot of the event after a change so that the bot can
 * post without asking again. If those two ever disagreed, the bot would be
 * reading one event in two shapes.
 */
export const EVENT_COLUMNS = {
  event_id:       events.eventId,
  rso_id:         events.rsoId,
  rso_name:       rsOs.name,
  title:          events.title,
  description:    events.description,
  start_time:     events.startTime,
  end_time:       events.endTime,
  is_private:     events.isPrivate,
  cancelled_at:   events.cancelledAt,
  location_id:    events.locationId,
  building:       locations.building,
  room_number:    locations.roomNumber,
  location_text:  events.locationText,
  location_note:  events.locationNote,
  series_id:      events.seriesId,
  series_frequency:      eventSeries.frequency,
  series_interval_weeks: eventSeries.intervalWeeks,
  series_days_of_week:   eventSeries.daysOfWeek,
  series_ends_on:        eventSeries.endsOn,
  interest_count: sql<number>`(SELECT COUNT(*) FROM Event_Interest i WHERE i.event_id = ${events.eventId})`.mapWith(Number),
};

/** The joins the shape above needs, applied to a select over Events. */
export function withEventJoins(builder: any) {
  return builder
    .innerJoin(rsOs, eq(rsOs.rsoId, events.rsoId))
    .leftJoin(locations, eq(locations.locationId, events.locationId))
    .leftJoin(eventSeries, eq(eventSeries.seriesId, events.seriesId));
}

/**
 * One event in that shape.
 *
 * The handle is the shared client unless a caller passes one of its own, which
 * is what a caller inside a transaction does: a client built over the
 * connection it is holding sees the change that transaction has not committed
 * yet, where the pool would wait for it.
 */
export function eventSnapshotQuery(eventId: number, handle: any = db) {
  return withEventJoins(handle.select(EVENT_COLUMNS).from(events))
    .where(eq(events.eventId, eventId))
    .limit(1);
}
