import pool, { query } from '../pool.js';
import { campusNow, campusStartOfToday } from '../../lib/timezone.js';

/**
 * How long a value in the facility text dictionary is.
 *
 * Both the write and the read truncate to this, because a value stored short and looked up
 * long matches nothing and would quietly record a booking as having no name. It is the
 * length that keeps a utf8mb4 unique key comfortably inside the index limit, and room
 * booking titles are far shorter in practice.
 */
const TEXT_LENGTH = 191;
export { upsertLocation as upsertFacilityLocation } from './locations.js';

/**
 * Upsert a facility reservation row with cross-source merge semantics.
 * @param {{ location_id: number, customer: string, event_name: string,
 *            start_time: string, end_time: string,
 *            source: 'tableau'|'astra' }} reservation
 * @returns {Promise<import('mysql2').ResultSetHeader>}
 */
export async function upsertReservation(reservation) {
  const {
    location_id, customer, event_name, start_time, end_time, source,
    activity_id = null, parent_activity_id = null, astra_event_id = null, activity_type = null,
    section_id = null, instructor = null,
  } = reservation
  const now = campusNow()

  /*
   * When each source first showed this booking, worked out here rather than in SQL.
   *
   * The source column is a SET, and reading a SET back inside ON DUPLICATE KEY UPDATE to
   * decide which of the two columns to touch is the kind of expression that is easy to get
   * subtly wrong. The caller already knows which source it is, so it passes a value for
   * that source and nothing for the other, and COALESCE keeps whichever was there first.
   */
  const astraFirstSeen = source === 'astra' ? now : null
  const tableauFirstSeen = source === 'tableau' ? now : null

  /*
   * Everything Ad Astra says beyond where and when is written only when it arrives.
   * Tableau sends none of it, so a Tableau poll must not blank what Ad Astra recorded, and
   * a field Ad Astra stops sending must leave the last known value alone rather than
   * replacing it with nothing.
   */
  return query(
    `INSERT INTO Facility_Reservations
       (location_id, customer, event_name, start_time, end_time, source, scraped_at,
        activity_id, parent_activity_id, astra_event_id, activity_type, section_id, instructor,
        astra_first_seen, tableau_first_seen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       customer = IF(VALUES(customer) != '', VALUES(customer), customer),
       event_name = IF(VALUES(event_name) != '', VALUES(event_name), event_name),
       source = source | VALUES(source),
       scraped_at = VALUES(scraped_at),
       activity_id = COALESCE(VALUES(activity_id), activity_id),
       parent_activity_id = COALESCE(VALUES(parent_activity_id), parent_activity_id),
       astra_event_id = COALESCE(VALUES(astra_event_id), astra_event_id),
       activity_type = COALESCE(VALUES(activity_type), activity_type),
       section_id = COALESCE(VALUES(section_id), section_id),
       instructor = COALESCE(VALUES(instructor), instructor),
       astra_first_seen = COALESCE(astra_first_seen, VALUES(astra_first_seen)),
       tableau_first_seen = COALESCE(tableau_first_seen, VALUES(tableau_first_seen))`,
    [
      location_id, customer, event_name, start_time, end_time, source, now,
      activity_id, parent_activity_id, astra_event_id, activity_type, section_id, instructor,
      astraFirstSeen, tableauFirstSeen,
    ]
  )
}

/**
 * The name of the lock one archive run holds while it is moving rows.
 *
 * Both pollers call the archive and both run a cycle the moment the server starts, so two
 * runs over the same rows is an ordinary occurrence rather than a rare race. Two runs that
 * each read the same expired rows write every one of them to history twice, and nothing in
 * the table would afterwards show which copy was real. The second run stands aside and
 * takes the rows on its next cycle instead.
 */
const ARCHIVE_LOCK = 'via_facilities_archive'

/**
 * Move every reservation whose campus day is over out of the working set and into history.
 *
 * This replaces a delete. Until migration 0021 the pollers destroyed a booking within
 * hours of the event happening, so VIA never retained a single completed reservation and
 * no question about what campus did last term could be answered at all. VISION.md has the
 * reasoning.
 *
 * The cutoff is the start of the current campus day rather than the present moment, and
 * that is load bearing. Ad Astra is asked for everything from midnight of the current day
 * onwards, so a booking that finished at ten in the morning is still in every poll for the
 * rest of that day. Archiving at the present moment moved it to history at noon, the next
 * poll put it straight back into the working set, and the poll after that wrote it to
 * history a second time. A booking finishing today would have reached history several
 * times over, its first seen timestamps reset on each return, and the history this work
 * exists to build would have been wrong from its first day. Waiting for the day to end
 * costs one day of expired rows in a table bounded by a hundred and eighty days, and
 * nothing reads those rows because every reader on a request path asks about the present
 * and the future.
 *
 * Expired rows still leave the working set, which is what keeps that table the size of the
 * rolling window the pollers fetch rather than growing for ever. No existing reader
 * changes behaviour. The rows are kept instead of dropped.
 *
 * History normalises its text into Facility_Text. One course section meeting three times a
 * week writes the same name and the same instructor dozens of times, so pointing them at
 * one dictionary row turns roughly seventy bytes of repeated text per row into twelve
 * bytes of identifiers. That is done here, in a batch, and never on a request path.
 *
 * The whole move runs in one transaction, so a failure halfway leaves the working set
 * exactly as it was rather than losing rows that were never written. Every statement in it
 * is held to the rows that existed when the run began, because a booking written by a poll
 * between the copy and the delete would otherwise be deleted without ever having been
 * copied.
 *
 * @returns {Promise<{ archived: number, skipped?: true }>}
 */
export async function archiveExpiredReservations() {
  const cutoff = campusStartOfToday()
  const conn = await pool.getConnection()
  let holdsLock = false
  try {
    const [[lock]] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [ARCHIVE_LOCK])
    if (Number(lock?.got) !== 1) return { archived: 0, skipped: true }
    holdsLock = true

    await conn.beginTransaction()

    /*
     * The highest identifier among the rows this run is taking. Identifiers are handed out
     * in order, so a row written after this point has a larger one and is left for the next
     * run rather than being deleted by this one without having been copied.
     */
    const [[oldest]] = await conn.query(
      'SELECT MAX(reservation_id) AS ceiling FROM Facility_Reservations WHERE end_time < ?',
      [cutoff],
    )
    const ceiling = oldest?.ceiling ?? null
    if (ceiling === null) {
      await conn.commit()
      return { archived: 0 }
    }

    /*
     * Every distinct string about to be needed, written once. INSERT IGNORE is what makes
     * this safe to run on every poll cycle for ever: a value the dictionary already holds
     * is skipped rather than duplicated or refused.
     *
     * An empty string is not a value worth a dictionary row. The columns it comes from are
     * NOT NULL with an empty default, so an absent name arrives as '' rather than as null,
     * and history should record that as nothing known rather than as a name that is blank.
     *
     * Truncated to the dictionary column's length here and matched the same way below. Both
     * sides have to agree, because a value stored short and looked up long finds nothing and
     * records a booking as having no name at all.
     */
    for (const column of ['event_name', 'customer', 'instructor', 'activity_type']) {
      await conn.query(
        `INSERT IGNORE INTO Facility_Text (value)
         SELECT DISTINCT LEFT(${column}, ${TEXT_LENGTH}) FROM Facility_Reservations
         WHERE end_time < ? AND reservation_id <= ?
           AND ${column} IS NOT NULL AND ${column} <> ''`,
        [cutoff, ceiling],
      )
    }

    const [moved] = await conn.query(
      `INSERT INTO Facility_Reservation_History
         (location_id, start_time, end_time, activity_id, parent_activity_id, astra_event_id, section_id,
          event_name_id, customer_id, instructor_id, activity_type_id,
          source, astra_first_seen, tableau_first_seen)
       SELECT
         r.location_id, r.start_time, r.end_time, r.activity_id, r.parent_activity_id,
         r.astra_event_id, r.section_id, en.text_id, cu.text_id, ins.text_id, at.text_id,
         r.source, r.astra_first_seen, r.tableau_first_seen
       FROM Facility_Reservations r
       LEFT JOIN Facility_Text en  ON en.value  = LEFT(r.event_name, ${TEXT_LENGTH})    AND r.event_name <> ''
       LEFT JOIN Facility_Text cu  ON cu.value  = LEFT(r.customer, ${TEXT_LENGTH})      AND r.customer <> ''
       LEFT JOIN Facility_Text ins ON ins.value = LEFT(r.instructor, ${TEXT_LENGTH})
       LEFT JOIN Facility_Text at  ON at.value  = LEFT(r.activity_type, ${TEXT_LENGTH})
       WHERE r.end_time < ? AND r.reservation_id <= ?`,
      [cutoff, ceiling],
    )

    await conn.query(
      'DELETE FROM Facility_Reservations WHERE end_time < ? AND reservation_id <= ?',
      [cutoff, ceiling],
    )
    await conn.commit()
    return { archived: moved.affectedRows ?? 0 }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    // The lock goes back before the connection does, because releasing a connection returns
    // it to the pool rather than closing it, and a lock left held would lock out every
    // later run for the life of the process.
    if (holdsLock) await conn.query('SELECT RELEASE_LOCK(?)', [ARCHIVE_LOCK])
    conn.release()
  }
}

/**
 * Count rows in Facility_Reservations (for scrape run reporting).
 * @returns {Promise<number>}
 */
export async function countReservations() {
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
  return query(`
    SELECT fr.reservation_id, fr.location_id, l.building, fr.start_time, fr.end_time
    FROM Facility_Reservations fr
    JOIN Locations l ON fr.location_id = l.location_id
    WHERE fr.start_time < ? AND fr.end_time > ?
  `, [endTime, startTime])
}

/**
 * One booking from the working set, whole.
 *
 * Deliberately separate from getReservationsInRange, which the scheduler calls with a
 * range covering weeks and which therefore reads as few columns as it can get away with.
 * This one is for asking about a single booking, where the extra columns cost nothing.
 *
 * @returns {Promise<object|null>}
 */
export async function findReservation(locationId, startTime, endTime) {
  const rows = await query(
    `SELECT * FROM Facility_Reservations
      WHERE location_id = ? AND start_time = ? AND end_time = ?`,
    [locationId, startTime, endTime],
  )
  return rows[0] ?? null
}

/**
 * Reservations that have already happened, with their text resolved back out of the
 * dictionary.
 *
 * Nothing on a request path calls this. History exists for the questions VISION.md asks
 * about terms, rooms and sources, and those are asked offline, which is what lets the
 * table be shaped for size rather than for speed of access.
 *
 * The joins resolve the four dictionary columns. A booking that carried no name, no
 * customer, no instructor or no type reads back as null for that column, which is the
 * honest record of a string the source never sent.
 *
 * @param {string} startTime campus wall clock
 * @param {string} endTime campus wall clock
 * @param {{ limit?: number }} [options] a ceiling, because history only grows
 */
export async function getHistoryOverlapping(startTime, endTime, { limit = 5000 } = {}) {
  return query(
    `SELECT
       h.history_id, h.location_id, h.start_time, h.end_time,
       h.activity_id, h.parent_activity_id, h.astra_event_id, h.section_id,
       en.value  AS event_name,
       cu.value  AS customer,
       ins.value AS instructor,
       at.value  AS activity_type,
       h.source, h.astra_first_seen, h.tableau_first_seen, h.archived_at
     FROM Facility_Reservation_History h
     LEFT JOIN Facility_Text en  ON en.text_id  = h.event_name_id
     LEFT JOIN Facility_Text cu  ON cu.text_id  = h.customer_id
     LEFT JOIN Facility_Text ins ON ins.text_id = h.instructor_id
     LEFT JOIN Facility_Text at  ON at.text_id  = h.activity_type_id
     WHERE h.start_time < ? AND h.end_time > ?
     ORDER BY h.start_time
     LIMIT ?`,
    [endTime, startTime, limit],
  )
}

/** How many reservations have been kept, which the poller logs after each archive run. */
export async function countHistory() {
  return query('SELECT COUNT(*) as count FROM Facility_Reservation_History')
    .then(result => result[0].count)
}
