import { query } from '../pool.js';

/**
 * Insert a new Poll_Log row to mark the start of a poller run.
 * @param {string} service - 'courses' | 'facilities' | 'astra'
 * @param {Date} startedAt
 * @returns {Promise<number>} The inserted log_id
 */
export async function insertPollLog(service, startedAt) {
  // TODO: write query
  const result = await query(
    'INSERT INTO Poll_Log (service, started_at) VALUES (?, ?)',
    [service, startedAt]
  )
  return result.insertId
}

/**
 * Update a Poll_Log row when a run completes (success or error).
 * @param {number} logId
 * @param {{ finishedAt: Date, rowsProcessed: number, rowsSkipped: number,
 *           errorCount: number, lastError?: string|null, metadata?: object|null }} opts
 */
export async function finalizePollLog(logId, { finishedAt, rowsProcessed, rowsSkipped, errorCount, lastError, metadata }) {
  // TODO: write query
  await query(
    `UPDATE Poll_Log SET finished_at=?, rows_processed=?, rows_skipped=?,
     error_count=?, last_error=?, metadata=?
     WHERE log_id=?`,
    [finishedAt, rowsProcessed, rowsSkipped, errorCount, lastError || null, metadata ? JSON.stringify(metadata) : null, logId]
  )
}

/**
 * Return the most recent Poll_Log row per service (one row per service).
 * @returns {Promise<Array<{ service: string, log_id: number, started_at: string,
 *   finished_at: string|null, rows_processed: number, rows_skipped: number,
 *   error_count: number, last_error: string|null, metadata: object|null }>>}
 */
export async function getLatestRunPerService() {
  // TODO: write query
  const rows = await query(
    `SELECT pl.service, pl.log_id, pl.started_at, pl.finished_at, pl.rows_processed,
            pl.rows_skipped, pl.error_count, pl.last_error, pl.metadata
     FROM Poll_Log pl
     JOIN (
       SELECT service, MAX(started_at) AS max_started
       FROM Poll_Log
       GROUP BY service
     ) sub ON pl.service = sub.service AND pl.started_at = sub.max_started`
  )
  return rows.map(row => ({ ...row, metadata: row.metadata ?? null }))
}

/**
 * Return Poll_Log rows for one service, ordered by started_at DESC, up to limit rows.
 * @param {string} service
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getRunHistory(service, limit) {
  // TODO: write query
  const rows = await query(
    'SELECT * FROM Poll_Log WHERE service=? ORDER BY started_at DESC LIMIT ?',
    [service, limit]
  )
  return rows.map(row => ({ ...row, metadata: row.metadata ?? null }))
}

/**
 * Insert one Unknown_Building_Codes row.
 * @param {number} logId
 * @param {string} rawCode
 */
export async function insertUnknownBuildingCode(logId, rawCode) {
  // TODO: write query
  await query(
    'INSERT INTO Unknown_Building_Codes (log_id, raw_code) VALUES (?, ?)',
    [logId, rawCode]
  )
}

/**
 * Return unique unknown building codes across all runs with occurrence count and
 * most recent seen_at, ordered by occurrences DESC.
 * @returns {Promise<Array<{ raw_code: string, occurrences: number, last_seen: string }>>}
 */
export async function getUnknownCodeFrequency() {
  // TODO: write query
  return query(
    `SELECT raw_code, COUNT(*) AS occurrences, MAX(seen_at) AS last_seen
     FROM Unknown_Building_Codes
     GROUP BY raw_code
     ORDER BY occurrences DESC`
  )
}
