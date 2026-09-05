/**
 * The two kinds of identifier the internal service API reads.
 *
 * Both were written out once per file that needed them, which is how a rule
 * about what a Discord identifier is comes to differ between the middleware
 * that resolves one and the endpoint behind it. They are written once here so
 * that every reader of either kind agrees.
 */

/**
 * A Discord snowflake is a decimal string, and never a JavaScript number: the
 * values are past the point where a double can hold every integer, so reading
 * one as a number quietly changes it.
 */
export const SNOWFLAKE = /^\d{1,32}$/;

/** Whether a value is a Discord snowflake as the API accepts one. */
export function isSnowflake(value) {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}

/** The snowflake a value holds, or null when it holds none. */
export function snowflake(value) {
  return isSnowflake(value) ? value : null;
}

/**
 * A path segment that has to be a whole number, or null.
 *
 * @param {unknown} raw
 * @returns {number|null}
 */
export function identifier(raw) {
  return /^\d+$/.test(String(raw ?? '')) ? Number(raw) : null;
}
