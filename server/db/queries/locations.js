import { query } from '../pool.js';

/**
 * Upsert a location row and return its location_id.
 * Used by scraper services that discover rooms from external data sources.
 * @param {string} building
 * @param {string} roomNumber
 * @param {number} [capacity] - max_capacity hint; defaults to 30 when unknown
 * @returns {Promise<number>} location_id
 * TODO: write query
 */
export async function upsertLocation(building, roomNumber, capacity = 30) {
  // TODO: write query
  await query('INSERT IGNORE INTO Locations (building, room_number, max_capacity) VALUES (?, ?, ?)', [building, roomNumber, capacity])
  if (capacity > 30) {
    await query('UPDATE Locations SET max_capacity = ? WHERE building = ? AND room_number = ?', [capacity, building, roomNumber])
  }
  const rows = await query('SELECT location_id FROM Locations WHERE building = ? AND room_number = ?', [building, roomNumber])
  return rows[0].location_id
}

/**
 * Get location IDs that are occupied during a time window.
 * Used by venueRecommender to filter out busy rooms.
 * @param {string} startTime - ISO datetime
 * @param {string} endTime   - ISO datetime
 * @param {number} [excludeEventId] - Optional event ID to exclude from conflict check (for updates)
 * @returns {Promise<Array<{ location_id: number }>>}
 * TODO: write query
 */
export async function getOccupiedDuring(startTime, endTime, excludeEventId) {
  // TODO: write query
  let eventCondition = ''
  const params = [startTime, endTime]
  if (excludeEventId !== undefined) {
    eventCondition = 'AND event_id <> ?'
    params.push(excludeEventId)
  }
  params.push(startTime, endTime)
  return query(
    `
    SELECT DISTINCT location_id FROM (
      SELECT location_id FROM Events
      WHERE start_time < ? AND end_time > ? ${eventCondition}
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
 * TODO: write query
 */
export async function getByCapacity(minCapacity, requiresAV) {
  // TODO: write query
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
 * Get a single location by ID.
 * @param {number} locationId
 * @returns {Promise<object|null>}
 * TODO: write query
 */
export async function getById(locationId) {
  // TODO: write query
  const rows = await query('SELECT * FROM Locations WHERE location_id = ?', [locationId])
  return rows.length > 0 ? rows[0] : null
}
