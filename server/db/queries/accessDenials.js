import { query } from '../pool.js';

/**
 * The denial table, in the raw SQL style of the modules around it.
 *
 * The upsert is what makes flushing safe: two flushes landing in the same
 * minute add rather than collide, so the flush interval and the bucket width
 * do not have to agree.
 */

/**
 * Write one flush worth of aggregates.
 * @param {Array<{ bucketStart: string, reason: string, route: string,
 *   authenticated: boolean, denialCount: number, clientCount: number }>} rows
 */
export async function upsertDenialBuckets(rows) {
  if (!rows.length) return;
  const placeholders = rows.map(() => '(?,?,?,?,?,?)').join(',');
  const values = rows.flatMap(row => [
    row.bucketStart, row.reason, row.route,
    row.authenticated ? 1 : 0, row.denialCount, row.clientCount,
  ]);
  await query(
    `INSERT INTO Access_Denials
       (bucket_start, reason, route, authenticated, denial_count, client_count)
     VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE
       denial_count = denial_count + VALUES(denial_count),
       client_count = GREATEST(client_count, VALUES(client_count))`,
    values
  );
}

/**
 * Forget denials past the retention window.
 * @param {number} days
 */
export async function pruneDenials(days) {
  await query(
    'DELETE FROM Access_Denials WHERE bucket_start < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [days]
  );
}

/**
 * Denials by day and reason, newest first, for the admin surface.
 * @param {number} days
 * @returns {Promise<Array<{ day: string, reason: string, denials: number, clients: number }>>}
 */
export async function getDenialSeries(days) {
  return query(
    `SELECT DATE(bucket_start) AS day, reason,
            SUM(denial_count) AS denials, MAX(client_count) AS clients
     FROM Access_Denials
     WHERE bucket_start >= DATE_SUB(NOW(), INTERVAL ? DAY)
     GROUP BY DATE(bucket_start), reason
     ORDER BY day DESC, denials DESC`,
    [days]
  );
}
