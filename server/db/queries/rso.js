import { query } from '../pool.js';
import { pageClause, pageParams } from './paging.js';

/**
 * List RSOs.
 * @param {{ limit?: number, offset?: number }} [page] omit both for every row.
 * @returns {Promise<Array>}
 */
export async function getAllRsos({ limit, offset } = {}) {
  return query(
    `SELECT rso_id, name, description, logo_color, founded_year FROM RSOs
     ORDER BY rso_id ${pageClause(limit, offset)}`,
    pageParams(limit, offset)
  )
}

/**
 * STAGE 3 ADVANCED QUERY 2
 * Single RSO with member list and event count.
 * @param {number} rsoId
 * @returns {Promise<{ rso_id, name, description, logo_color, founded_year, event_count, members: Array }>}
 */
export async function getRsoById(rsoId) {
  return query(
  `
  SELECT
      r.rso_id,
      r.name AS rso_name,
      r.description,
      r.logo_color,
      r.founded_year,
      u.net_id,
      u.full_name,
      u.email,
      u.invited_at,
      m.role,
      m.joined_at,
      (
          SELECT COUNT(*)
          FROM Events e
          WHERE e.rso_id = ?
      ) AS event_count
  FROM RSOs r
  LEFT JOIN RSO_Memberships m
      ON r.rso_id = m.rso_id
  LEFT JOIN Users u
      ON m.net_id = u.net_id
  WHERE
      r.rso_id = ?
  `,
  [rsoId, rsoId]
)
}

/**
 * Update RSO profile fields.
 * @param {number} rsoId
 * @param {{ name?: string, description?: string, logo_color?: string }} updates
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function updateRso(rsoId, updates) {
  const fields = []
  const values = []
  if (updates.name) {
    fields.push('name = ?')
    values.push(updates.name)
  }
  if (updates.description !== undefined) {
    fields.push('description = ?')
    values.push(updates.description)
  }
  if (updates.logo_color !== undefined) {
    fields.push('logo_color = ?')
    values.push(updates.logo_color)
  }
  if (updates.founded_year !== undefined) {
    fields.push('founded_year = ?')
    values.push(updates.founded_year)
  }
  if (fields.length === 0) {
    return { affectedRows: 0 }
  }
  values.push(rsoId)
  const sql = `UPDATE RSOs SET ${fields.join(', ')} WHERE rso_id = ?`
  return query(sql, values)
}

/**
 * Get a single membership row.
 * @param {string} netId
 * @param {number} rsoId
 * @returns {Promise<{ net_id, rso_id, role, joined_at }|null>}
 */
export async function getMembership(netId, rsoId) {
  const result = await query('SELECT net_id, rso_id, role, joined_at FROM RSO_Memberships WHERE net_id = ? AND rso_id = ?', [netId, rsoId])
  return result.length > 0 ? result[0] : null
}

/**
 * Add a member to an RSO.
 * @param {string} netId
 * @param {number} rsoId
 * @param {'Member'|'Board'|'Admin'} role
 * @returns {Promise<void>}
 */
export async function addMember(netId, rsoId, role) {
  return query('INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = ?', [netId, rsoId, role, role])
}

/**
 * Remove a member from an RSO.
 * @param {string} netId
 * @param {number} rsoId
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function removeMember(netId, rsoId) {
  return query('DELETE FROM RSO_Memberships WHERE net_id = ? AND rso_id = ?', [netId, rsoId])
}

/**
 * Get all RSO memberships for a user (used to populate auth context).
 * @param {string} netId
 * @returns {Promise<Array<{ rso_id, name, role, joined_at }>>}
 */
export async function getUserMemberships(netId) {
  return query('SELECT m.rso_id, r.name, m.role, m.joined_at FROM RSO_Memberships m JOIN RSOs r ON m.rso_id = r.rso_id WHERE m.net_id = ?', [netId])
}

/**
 * Insert a new RSO row.
 * @param {{ name: string, description?: string, logo_color?: string, founded_year?: number }} data
 * @returns {Promise<{ insertId: number }>}
 */
export async function createRso(data) {
  return query('INSERT INTO RSOs (name, description, logo_color, founded_year) VALUES (?, ?, ?, ?)', [data.name, data.description, data.logo_color, data.founded_year])
}

/**
 * Delete an RSO and all associated data (members, events, tags).
 * @param {number} rsoId
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function deleteRso(rsoId) {
  return query('DELETE FROM RSOs WHERE rso_id = ?', [rsoId])
}

/**
 * The organizations that have something to show a reader.
 *
 * An organization with no public event has an empty page, and an empty page is
 * exactly the thin content a search engine discovers and then declines to
 * index, so only the ones with at least one public event that was not called
 * off are published. The counts and the dates are what the page and the
 * sitemap both need, so they are read here rather than in a second query per
 * organization.
 *
 * @returns {Promise<Array<{ rso_id, name, description, founded_year, logo_color,
 *   event_count, upcoming_count, last_change }>>}
 */
export async function getPublicOrganizations() {
  return query(
    `SELECT
        r.rso_id,
        r.name,
        r.description,
        r.founded_year,
        r.logo_color,
        COUNT(e.event_id) AS event_count,
        SUM(CASE WHEN e.start_time >= NOW() THEN 1 ELSE 0 END) AS upcoming_count,
        MAX(e.updated_at) AS last_change
     FROM RSOs r
     JOIN Events e
       ON e.rso_id = r.rso_id
      AND e.is_private = FALSE
      AND e.cancelled_at IS NULL
     GROUP BY r.rso_id, r.name, r.description, r.founded_year, r.logo_color
     ORDER BY r.name`
  )
}

/** One published organization, or nothing where it has no public events. */
export async function getPublicOrganization(rsoId) {
  const rows = await query(
    `SELECT
        r.rso_id,
        r.name,
        r.description,
        r.founded_year,
        r.logo_color,
        COUNT(e.event_id) AS event_count,
        SUM(CASE WHEN e.start_time >= NOW() THEN 1 ELSE 0 END) AS upcoming_count,
        MAX(e.updated_at) AS last_change
     FROM RSOs r
     JOIN Events e
       ON e.rso_id = r.rso_id
      AND e.is_private = FALSE
      AND e.cancelled_at IS NULL
     WHERE r.rso_id = ?
     GROUP BY r.rso_id, r.name, r.description, r.founded_year, r.logo_color`,
    [rsoId]
  )
  return rows[0] ?? null
}

/**
 * The public events of one organization, the ones still to come first and the
 * recent ones after them.
 *
 * Both are on the page because both are what somebody deciding whether to
 * follow an organization is reading for: what is next, and whether anything
 * has been happening. A cancelled event is left off, as it is everywhere a
 * listing is drawn for somebody who is not on the board.
 *
 * @param {number} rsoId
 * @param {{ upcomingLimit?: number, pastLimit?: number }} [limits]
 */
export async function getPublicEventsForRso(rsoId, { upcomingLimit = 50, pastLimit = 20 } = {}) {
  const columns = `
      e.event_id, e.title, e.description, e.start_time, e.end_time,
      e.is_private, e.cancelled_at, e.rso_id, r.name AS rso_name,
      e.location_text, l.building, l.room_number,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags`

  const from = `
     FROM Events e
     JOIN RSOs r ON e.rso_id = r.rso_id
     LEFT JOIN Locations l ON e.location_id = l.location_id
     LEFT JOIN Event_Tags t ON e.event_id = t.event_id
    WHERE e.rso_id = ? AND e.is_private = FALSE AND e.cancelled_at IS NULL`

  const [upcoming, past] = await Promise.all([
    query(
      `SELECT ${columns} ${from} AND e.start_time >= NOW()
       GROUP BY e.event_id ORDER BY e.start_time ASC LIMIT ?`,
      [rsoId, upcomingLimit]
    ),
    query(
      `SELECT ${columns} ${from} AND e.start_time < NOW()
       GROUP BY e.event_id ORDER BY e.start_time DESC LIMIT ?`,
      [rsoId, pastLimit]
    ),
  ])
  return { upcoming, past }
}
