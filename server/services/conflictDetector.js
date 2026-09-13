import { getOccupiedDuring } from '../db/queries/locations.js';
import { getSectionsOccupying } from '../db/queries/internalReads.ts';

/**
 * Check whether a location is occupied during a time window.
 * @param {number} locationId
 * @param {string} startTime - ISO datetime
 * @param {string} endTime   - ISO datetime
 * @param {number} [excludeEventId] - Exclude this event from the check (for updates)
 * @returns {Promise<boolean>} true if there is a conflict
 */
export async function checkConflict(locationId, startTime, endTime, excludeEventId = null) {
  const occupied = await getOccupiedDuring(startTime, endTime, excludeEventId);
  return occupied.some(row => row.location_id === locationId);
}

/**
 * Everything that has a room during a window, as a set of location identifiers.
 *
 * checkConflict above answers the booking question: may this event take this
 * room. It weighs VIA's own events and the facility reservations the pollers
 * collect, because those are the two a board can do something about. Asking
 * which rooms in a building are free is a wider question, since a room the
 * timetable has given to a class at six is not free at six either, so this
 * reading adds the course sections. The booking check is deliberately left as
 * it was, so that adding this changes nothing about how events are created.
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
