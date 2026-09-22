import pool, { query } from '../pool.js'
import { recordEventCreatedOnConnection } from './outbox.ts'

/**
 * Call GetRSOStats stored procedure.
 * mysql2 returns multiple result sets from CALL as an array:
 * @param {number} rsoId
 * @returns {Promise<{ memberBreakdown: object[], topTags: object[] }>}
 */
export async function callGetRSOStats(rsoId) {
  const results = await query('CALL GetRSOStats(?)', [rsoId])
  return {
    memberBreakdown: Array.isArray(results[0]) ? results[0] : [],
    topTags: Array.isArray(results[1]) ? results[1] : [],
  }
}

/**
 * Atomically create an event + tags under SERIALIZABLE isolation.
 *
 * Another event in the room refuses the write. A facility reservation does not,
 * and is reported back instead, because it is very often the organization's own
 * booking arriving here before the event is entered.
 *
 * @param {{ rso_id, created_by, location_id, title, description, start_time, end_time, is_private }} eventData
 * @param {string[]} tagNames
 * @returns {Promise<{ eventId?: number, reserved?: boolean, conflict?: true, unauthorized?: true }>}
 */
export async function createEventTransactional(eventData, tagNames = [], isGlobalAdmin = false) {
  const conn = await pool.getConnection()
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    await conn.beginTransaction()

    // Advanced query 1. Only a room can be double booked. An event with no room,
    // or one whose location is free text, has nothing to collide with.
    //
    // The two kinds of occupancy are answered differently. Another event is a
    // clash, because a room given to two events is something VIA created and
    // can refuse. A reservation collected from Ad Astra or from Tableau is not,
    // because it is very often the organization's own booking, which reaches
    // VIA days or weeks before anybody enters the event. Refusing those turned
    // an organization away from the room it had actually booked. The
    // reservation is reported instead, and the event is written.
    let reserved = false
    if (eventData.location_id) {
      const [occupied] = await conn.query(
        `SELECT DISTINCT source FROM (
           SELECT 'event' AS source FROM Events
           WHERE location_id = ? AND start_time < ? AND end_time > ? AND cancelled_at IS NULL
           UNION ALL
           SELECT 'reservation' AS source FROM Facility_Reservations
           WHERE location_id = ? AND start_time < ? AND end_time > ?
         ) AS occupied`,
        [
          eventData.location_id, eventData.end_time,   eventData.start_time,
          eventData.location_id, eventData.end_time,   eventData.start_time,
        ]
      )

      if (occupied.some(row => row.source === 'event')) {
        await conn.rollback()
        return { conflict: true }
      }
      reserved = occupied.length > 0
    }

    // Advanced query 2
    const [authRows] = await conn.query(
      `SELECT COUNT(*) AS count
       FROM RSO_Memberships m
       JOIN RSOs r ON m.rso_id = r.rso_id
       WHERE m.net_id = ? AND m.rso_id = ? AND m.role IN ('Board', 'Admin')`,
      [eventData.created_by, eventData.rso_id]
    )

    if (!isGlobalAdmin && parseInt(authRows[0].count, 10) === 0) {
      await conn.rollback()
      return { unauthorized: true }
    }

    const [result] = await conn.query('INSERT INTO Events SET ?', [eventData])
    const eventId = result.insertId

    const uniqueTags = [...new Set(tagNames)]
    if (uniqueTags.length > 0) {
      await conn.query(
        'INSERT IGNORE INTO Tags (tag_name) VALUES ?',
        [uniqueTags.map(t => [t])]
      )
      await conn.query(
        'INSERT INTO Event_Tags (event_id, tag_name) VALUES ?',
        [uniqueTags.map(t => [eventId, t])]
      )
    }

    // The Discord bot hears about the event from the outbox, and the entry is
    // written here, on this connection, so that it commits with the event it
    // describes and rolls back with it.
    await recordEventCreatedOnConnection(conn, eventId)

    await conn.commit()
    return { eventId, reserved }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
