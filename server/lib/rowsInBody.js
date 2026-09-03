/**
 * How many rows a response handed over.
 *
 * Counted from the payload rather than inside each controller, so that a list
 * route added later is counted without anybody having to remember. A body
 * carrying only an error is worth nothing, because a caller already refused
 * should not also be charged for the refusal.
 */

/**
 * @param {unknown} body
 * @returns {number}
 */
export function rowsInBody(body) {
  if (Array.isArray(body)) return body.length;
  if (!body || typeof body !== 'object') return 0;
  if ('error' in body) return 0;

  let rows = 0;
  for (const value of Object.values(body)) {
    if (Array.isArray(value)) rows += value.length;
    else if (value && typeof value === 'object') rows += 1;
  }
  return rows;
}
