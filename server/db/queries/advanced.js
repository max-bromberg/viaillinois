import pool, { query } from '../pool.js'

/**
 * Call GetRSOStats stored procedure.
 * mysql2 returns multiple result sets from CALL as an array:
 * @param {number} rsoId
 * @returns {Promise<{ memberBreakdown: object[], topTags: object[] }>}
 */
export async function callGetRSOStats(rsoId) {
  // TODO: write query
  const results = await query('CALL GetRSOStats(?)', [rsoId])
  return {
    memberBreakdown: Array.isArray(results[0]) ? results[0] : [],
    topTags: Array.isArray(results[1]) ? results[1] : [],
  }
}

/**
 * Atomically create an event + tags under SERIALIZABLE isolation.
 * @param {{ rso_id, created_by, location_id, title, description, start_time, end_time, is_private }} eventData
 * @param {string[]} tagNames
 * @returns {Promise<{ eventId?: number, conflict?: true, unauthorized?: true }>}
 */
export async function createEventTransactional(eventData, tagNames = [], isGlobalAdmin = false) {
  // TODO: write query
  const conn = await pool.getConnection()
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE')
    await conn.beginTransaction()

    // Advanced query 1
    const [conflicts] = await conn.query(
      `SELECT location_id FROM (
         SELECT location_id FROM Events
         WHERE location_id = ? AND start_time < ? AND end_time > ?
         UNION ALL
         SELECT location_id FROM Facility_Reservations
         WHERE location_id = ? AND start_time < ? AND end_time > ?
       ) AS occupied
       LIMIT 1`,
      [
        eventData.location_id, eventData.end_time,   eventData.start_time,
        eventData.location_id, eventData.end_time,   eventData.start_time,
      ]
    )

    if (conflicts.length > 0) {
      await conn.rollback()
      return { conflict: true }
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

    await conn.commit()
    return { eventId }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
