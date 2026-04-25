import { query } from '../pool.js';
export { upsertLocation as upsertFacilityLocation } from './locations.js';

/**
 * Upsert a facility reservation row with cross-source merge semantics.
 * @param {{ location_id: number, customer: string, event_name: string,
 *            start_time: string, end_time: string,
 *            source: 'tableau'|'astra' }} reservation
 * @returns {Promise<import('mysql2').ResultSetHeader>}
 */
export async function upsertReservation(reservation) {
  // TODO: write query
  const { location_id, customer, event_name, start_time, end_time, source } = reservation
  return query(
    `INSERT INTO Facility_Reservations (location_id, customer, event_name, start_time, end_time, source, scraped_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       customer = IF(VALUES(customer) != '', VALUES(customer), customer),
       event_name = IF(VALUES(event_name) != '', VALUES(event_name), event_name),
       source = source | VALUES(source),
       scraped_at = NOW()`,
    [location_id, customer, event_name, start_time, end_time, source]
  )
}

/**
 * Delete all facility reservations with end_time before now.
 * Keeps the table from growing unboundedly across daily scrape runs.
 * @returns {Promise<import('mysql2').ResultSetHeader>}
 */
export async function deleteExpiredReservations() {
  // TODO: write query
  return query('DELETE FROM Facility_Reservations WHERE end_time < NOW()')
}

/**
 * Count rows in Facility_Reservations (for scrape run reporting).
 * @returns {Promise<number>}
 * TODO: write query
 */
export async function countReservations() {
  // TODO: write query
  return query('SELECT COUNT(*) as count FROM Facility_Reservations').then(result => result[0].count)
}

/**
 * Fetch all facility reservations whose time window overlaps [startTime, endTime].
 * @param {string} startTime - ISO datetime or MySQL DATETIME string
 * @param {string} endTime   - ISO datetime or MySQL DATETIME string
 * @returns {Promise<Array<{
 *   reservation_id: number,
 *   location_id: number,
 *   building: string,
 *   start_time: string,
 *   end_time: string
 * }>>}
 */
export async function getReservationsInRange(startTime, endTime) {
  // TODO: write query
  return query(`
    SELECT fr.reservation_id, fr.location_id, l.building, fr.start_time, fr.end_time
    FROM Facility_Reservations fr
    JOIN Locations l ON fr.location_id = l.location_id
    WHERE fr.start_time < ? AND fr.end_time > ?
  `, [endTime, startTime])
}
