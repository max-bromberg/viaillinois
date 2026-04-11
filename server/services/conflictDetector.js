import { getOccupiedDuring } from '../db/queries/locations.js';

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
