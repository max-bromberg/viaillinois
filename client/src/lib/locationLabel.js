/**
 * How an event's location reads on a card.
 *
 * A location is optional and takes one of three forms: a room VIA knows about,
 * free text the organizer typed for somewhere that is not a room, or nothing at
 * all because it has not been decided. The room wins when both are present,
 * because it is the more precise of the two.
 *
 * @param {{ building?: string|null, room_number?: string|null, location_text?: string|null }} event
 * @returns {string}
 */
export function locationLabel(event) {
  if (event?.building) return `${event.building} ${event.room_number ?? ''}`.trim();
  if (event?.location_text) return event.location_text;
  return 'Location to be announced';
}
