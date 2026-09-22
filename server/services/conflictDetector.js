import { getOccupiedDuring } from '../db/queries/locations.js';
import { getSectionsOccupying } from '../db/queries/internalReads.ts';

/**
 * What has a room during a time window, told apart by where it came from.
 *
 * The two answers are not the same. Another event on VIA is a clash, because a
 * room given to two events is something VIA created and can refuse. A
 * reservation collected from Ad Astra or from Tableau is not, because it is
 * very often the organization's own booking, which reaches VIA days or weeks
 * before anybody enters the event. Refusing those turned an organization away
 * from the room it had actually booked, which is the case the platform most
 * wants to support. VIA observes the reservation system for ground truth and
 * asserts no booking of its own, so the reservation is reported rather than
 * enforced.
 *
 * A row that names no source counts as an event.
 *
 * @param {number} locationId
 * @param {string} startTime - ISO datetime
 * @param {string} endTime   - ISO datetime
 * @param {number} [excludeEventId] - Exclude this event from the check (for updates)
 * @returns {Promise<{ event: boolean, reservation: boolean }>}
 */
export async function occupancyInRoom(locationId, startTime, endTime, excludeEventId = null) {
  const occupied = await getOccupiedDuring(startTime, endTime, excludeEventId);
  const here = occupied.filter(row => row.location_id === locationId);
  return {
    event: here.some(row => row.source !== 'reservation'),
    reservation: here.some(row => row.source === 'reservation'),
  };
}

/**
 * Everything that has a room during a window, as a set of location identifiers.
 *
 * occupancyInRoom above answers the booking question: may this event take this
 * room. It weighs VIA's own events and the facility reservations the pollers
 * collect, because those are the two a board can do something about. Asking
 * which rooms in a building are free is a wider question, since a room the
 * timetable has given to a class at six is not free at six either, so this
 * reading adds the course sections. Every reading counts here, the reservations
 * included, because a room somebody has reserved is not a room that is free to
 * sit in, whatever the booking check makes of it.
 *
 * @param {string} startTime campus wall clock
 * @param {string} endTime campus wall clock
 * @returns {Promise<Set<number>>}
 */
export async function occupiedLocationIds(startTime, endTime) {
  const [rooms, sections] = await Promise.all([
    getOccupiedDuring(startTime, endTime),
    getSectionsOccupying(startTime, endTime),
  ]);
  return new Set([...rooms.map(row => row.location_id), ...sections]);
}
