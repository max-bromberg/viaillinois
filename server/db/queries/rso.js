import { query } from '../pool.js';

/**
 * List all RSOs.
 * @returns {Promise<Array>}
 * TODO: write query
 */
export async function getAllRsos() {
  // TODO: write query
  return query('SELECT rso_id, name, description, logo_color, founded_year FROM RSOs')
}

/**
 * STAGE 3 ADVANCED QUERY 2
 * Single RSO with member list and event count.
 * @param {number} rsoId
 * @returns {Promise<{ rso_id, name, description, logo_color, founded_year, event_count, members: Array }>}
 * TODO: write query
 */
export async function getRsoById(rsoId) {
  // TODO: write query
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
 * TODO: write query
 */
export async function updateRso(rsoId, updates) {
  // TODO: write query
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
 * TODO: write query
 */
export async function getMembership(netId, rsoId) {
  // TODO: write query
  const result = await query('SELECT net_id, rso_id, role, joined_at FROM RSO_Memberships WHERE net_id = ? AND rso_id = ?', [netId, rsoId])
  return result.length > 0 ? result[0] : null
}

/**
 * Add a member to an RSO.
 * @param {string} netId
 * @param {number} rsoId
 * @param {'Member'|'Board'|'Admin'} role
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function addMember(netId, rsoId, role) {
  // TODO: write query
  return query('INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = ?', [netId, rsoId, role, role])
}

/**
 * Remove a member from an RSO.
 * @param {string} netId
 * @param {number} rsoId
 * @returns {Promise<{ affectedRows: number }>}
 * TODO: write query
 */
export async function removeMember(netId, rsoId) {
  // TODO: write query
  return query('DELETE FROM RSO_Memberships WHERE net_id = ? AND rso_id = ?', [netId, rsoId])
}

/**
 * Get all RSO memberships for a user (used to populate auth context).
 * @param {string} netId
 * @returns {Promise<Array<{ rso_id, name, role, joined_at }>>}
 * TODO: write query
 */
export async function getUserMemberships(netId) {
  // TODO: write query
  return query('SELECT m.rso_id, r.name, m.role, m.joined_at FROM RSO_Memberships m JOIN RSOs r ON m.rso_id = r.rso_id WHERE m.net_id = ?', [netId])
}

/**
 * Insert a new RSO row.
 * @param {{ name: string, description?: string, logo_color?: string, founded_year?: number }} data
 * @returns {Promise<{ insertId: number }>}
 * TODO: write query
 */
export async function createRso(data) {
  // TODO: write query
  return query('INSERT INTO RSOs (name, description, logo_color, founded_year) VALUES (?, ?, ?, ?)', [data.name, data.description, data.logo_color, data.founded_year])
}
