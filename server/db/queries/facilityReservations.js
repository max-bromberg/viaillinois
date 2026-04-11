import { query } from '../pool.js';
export { upsertLocation as upsertFacilityLocation } from './locations.js';

/**
 * Upsert a facility reservation row. Safe to run repeatedly (idempotent).
 * @param {{ location_id: number, customer: string, event_name: string, start_time: string, end_time: string }} reservation
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function upsertReservation(reservation) {
  // TODO: write query
  return query('INSERT IGNORE INTO Facility_Reservations (location_id, customer, event_name, start_time, end_time) VALUES (?, ?, ?, ?, ?)', [reservation.location_id, reservation.customer, reservation.event_name, reservation.start_time, reservation.end_time])
}

/**
 * Delete all facility reservations with end_time before now.
 * Keeps the table from growing unboundedly across daily scrape runs.
 * @returns {Promise<void>}
 * TODO: write query
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
