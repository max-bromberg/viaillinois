import { query } from '../pool.js';

/**
 * Get a user by net_id.
 * @param {string} netId
 * @returns {Promise<object|null>}
 * TODO: write query
 */
export async function getUserByNetId(netId) {
  // TODO: write query
  return query('SELECT net_id, full_name, email, is_global_admin FROM Users WHERE net_id = ?', [netId]).then(results => results[0] || null)
}

/**
 * Insert or update a user (for Azure AD upsert on login).
 * @param {{ net_id: string, full_name: string, email: string }} userData
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function upsertUser(userData) {
  // TODO: write query
  return query('INSERT INTO Users (net_id, full_name, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE full_name = ?, email = ?', [userData.net_id, userData.full_name, userData.email, userData.full_name, userData.email])
}

/**
 * Insert a local account (admin-created fallback login).
 * @param {string} netId
 * @param {string} passwordHash - bcrypt hash
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function createLocalAccount(netId, passwordHash) {
  // TODO: write query
  return query('INSERT INTO LocalAccounts (net_id, password_hash) VALUES (?, ?)', [netId, passwordHash])
}

/**
 * Get a local account by net_id for passport-local verify.
 * @param {string} netId
 * @returns {Promise<{ net_id, password_hash, full_name, email, is_global_admin }|null>}
 * TODO: write query
 */
export async function getLocalAccount(netId) {
  // TODO: write query
  return query('SELECT la.net_id, la.password_hash, u.full_name, u.email, u.is_global_admin FROM LocalAccounts la JOIN Users u ON la.net_id = u.net_id WHERE la.net_id = ?', [netId]).then(results => results[0] || null)
}

/**
 * Get all users who have a local (password-based) account, excluding global admins.
 * @returns {Promise<Array<{ net_id, full_name, email }>>}
 */
export async function getAllLocalUsers() {
  return query('SELECT u.net_id, u.full_name, u.email FROM Users u JOIN LocalAccounts la ON u.net_id = la.net_id WHERE u.is_global_admin = FALSE')
}

/**
 * Delete a user by net_id. Cascades to LocalAccounts via FK.
 * @param {string} netId
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function deleteUser(netId) {
  return query('DELETE FROM Users WHERE net_id = ?', [netId])
}

/**
 * Update the bcrypt password hash for a local account.
 * @param {string} netId
 * @param {string} passwordHash - bcrypt hash
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function updateLocalPassword(netId, passwordHash) {
  return query('UPDATE LocalAccounts SET password_hash = ? WHERE net_id = ?', [passwordHash, netId])
}

/**
 * Update mutable fields on a Users row.
 * @param {string} netId
 * @param {{ full_name?: string, email?: string }} updates
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function updateUser(netId, updates) {
  const fields = []
  const values = []
  if (updates.full_name !== undefined) {
    fields.push('full_name = ?')
    values.push(updates.full_name)
  }
  if (updates.email !== undefined) {
    fields.push('email = ?')
    values.push(updates.email)
  }
  if (fields.length === 0) {
    return { affectedRows: 0 }
  }
  values.push(netId)
  const sql = `UPDATE Users SET ${fields.join(', ')} WHERE net_id = ?`
  return query(sql, values)
}
