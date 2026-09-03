/**
 * The LIMIT and OFFSET fragment for a page, shared by the list queries.
 *
 * A caller that names no limit gets every row. That is deliberate: the admin
 * listings and the sitemap builder want the whole set, and neither is reachable
 * by an anonymous caller. The public routes pass the values that
 * lib/pagination.js has already validated and clamped, so the ceiling in the
 * route table is the ceiling the database enforces.
 *
 * The values are bound as parameters rather than interpolated into the SQL, so
 * nothing a caller sends can be read as SQL even if a route forgets to
 * validate it.
 */

/**
 * @param {number|undefined} limit
 * @param {number|undefined} offset
 * @returns {string} the fragment to append, which may be empty
 */
export function pageClause(limit, offset) {
  if (!Number.isInteger(limit)) return '';
  return Number.isInteger(offset) && offset > 0 ? 'LIMIT ? OFFSET ?' : 'LIMIT ?';
}

/**
 * The parameters that fill the fragment above, in the same order.
 * @param {number|undefined} limit
 * @param {number|undefined} offset
 * @returns {number[]}
 */
export function pageParams(limit, offset) {
  if (!Number.isInteger(limit)) return [];
  return Number.isInteger(offset) && offset > 0 ? [limit, offset] : [limit];
}
