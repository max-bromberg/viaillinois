import { query } from '../pool.js';
import { rankLocations } from '../../lib/locationSearch.js';

/**
 * Upsert a location row and return its location_id.
 * Used by scraper services that discover rooms from external data sources.
 * @param {string} building
 * @param {string} roomNumber
 * @param {number} [capacity] - max_capacity hint; defaults to 30 when unknown
 * @returns {Promise<number>} location_id
 */
export async function upsertLocation(building, roomNumber, capacity = 30) {
  await query('INSERT IGNORE INTO Locations (building, room_number, max_capacity) VALUES (?, ?, ?)', [building, roomNumber, capacity])
  if (capacity > 30) {
    await query('UPDATE Locations SET max_capacity = ? WHERE building = ? AND room_number = ?', [capacity, building, roomNumber])
  }
  const rows = await query('SELECT location_id FROM Locations WHERE building = ? AND room_number = ?', [building, roomNumber])
  return rows[0].location_id
}

/**
 * Get location IDs that are occupied during a time window.
 * Used by intelligentScheduler to filter out busy rooms.
 * @param {string} startTime - ISO datetime
 * @param {string} endTime   - ISO datetime
 * @param {number} [excludeEventId] - Optional event ID to exclude from conflict check (for updates)
 * @returns {Promise<Array<{ location_id: number }>>}
 */
export async function getOccupiedDuring(startTime, endTime, excludeEventId) {
  let eventCondition = ''
  const params = [endTime, startTime]
  if (excludeEventId !== undefined) {
    eventCondition = 'AND event_id <> ?'
    params.push(excludeEventId)
  }
  params.push(endTime, startTime)
  return query(
    `
    SELECT DISTINCT location_id FROM (
      SELECT location_id FROM Events
      WHERE start_time < ? AND end_time > ? AND cancelled_at IS NULL ${eventCondition}
      UNION ALL
      SELECT location_id FROM Facility_Reservations
      WHERE start_time < ? AND end_time > ?
    ) AS occupied_locations
    `,
    params
  )
}

/**
 * STAGE 3 ADVANCED QUERY 3
 * Get locations meeting capacity and AV requirements, with occupancy stats.
 * @param {number} minCapacity
 * @param {boolean} requiresAV
 * @returns {Promise<Array<{ location_id, building, room_number, max_capacity, has_av_equipment, weekly_usage }>>}
 */
export async function getByCapacity(minCapacity, requiresAV = false) {
  return query(
  `
  SELECT
      l.location_id,
      l.building,
      l.room_number,
      l.max_capacity,
      l.has_av_equipment,
      COUNT(cs.section_id) AS weekly_usage
  FROM Locations l
  LEFT JOIN Course_Sections cs
      ON l.location_id = cs.location_id
  WHERE
      l.max_capacity >= ?
      AND (? = FALSE OR l.has_av_equipment = TRUE)
  GROUP BY
      l.location_id
  ORDER BY
      ABS(l.max_capacity - ?) ASC
  `,
  [minCapacity, requiresAV, minCapacity]
)
}

/**
 * Every room, cached briefly.
 *
 * Ranking happens in JavaScript rather than SQL because the useful comparison
 * is word by word: a code has to expand into the words of a building name, and
 * a query word has to match the start of a stored word. SQL LIKE cannot express
 * that without a pattern per word per row.
 *
 * That means reading the table, so the result is held for a minute. Rooms only
 * change when a poller runs, which is once every few hours, and a search box
 * queries on nearly every keystroke.
 */
const CACHE_TTL_MS = 60_000;
let cache = null;

/** Drop the cached room list. Tests use this after changing the table. */
export function clearLocationCache() {
  cache = null;
}

export async function allLocations() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await query(
    'SELECT location_id, building, room_number, max_capacity, has_av_equipment FROM Locations'
  );
  cache = { at: Date.now(), rows };
  return rows;
}

/**
 * Search rooms by building name, building code or room number, best match first.
 *
 * @param {string} q search term
 * @param {number} [limit=10]
 * @returns {Promise<Array<{ location_id, building, room_number, max_capacity }>>}
 */
export async function searchLocations(q, limit = 10) {
  return rankLocations(q, await allLocations(), limit);
}

/**
 * Get a single location by ID.
 * @param {number} locationId
 * @returns {Promise<object|null>}
 */
export async function getById(locationId) {
  const rows = await query('SELECT * FROM Locations WHERE location_id = ?', [locationId])
  return rows.length > 0 ? rows[0] : null
}
