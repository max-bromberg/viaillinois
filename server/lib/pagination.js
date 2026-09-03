/**
 * How much of a list one request may ask for.
 *
 * Two reasons this exists. A request that can ask for the whole table is the
 * cheapest way both to collect the corpus and to exhaust the process, and
 * capping the depth of paging is what forces a client that wants everything to
 * make many requests, which is the thing the public budgets can actually
 * measure. A limit above the ceiling is quietly clamped, because a caller
 * asking for more than it may have is usually a mistake and the clamped answer
 * is still a correct answer. A limit that is not a number is refused, because
 * it used to reach the database as LIMIT NaN and come back as a 500.
 */

const NOT_A_WHOLE_NUMBER = 'limit and offset must be whole numbers of zero or more.';
const TOO_DEEP = 'That page is too far into the results. Please narrow the range by date.';

/** Per route ceilings. Every list endpoint names one of these. */
export const PAGING_LIMITS = {
  events:   { defaultLimit: 50, maxLimit: 100, maxOffset: 5000 },
  midterms: { defaultLimit: 50, maxLimit: 100, maxOffset: 5000 },
  courses:  { defaultLimit: 50, maxLimit: 100, maxOffset: 5000 },
  rsos:     { defaultLimit: 50, maxLimit: 100, maxOffset: 1000 },
  // The venues search box was serving ten results before this module existed,
  // and this table exists to add a ceiling rather than to change a default.
  venues:   { defaultLimit: 10, maxLimit: 100, maxOffset: 1000 },
  kiosk:    { defaultLimit: 10, maxLimit: 50,  maxOffset: 0 },
};

/**
 * A whole number of zero or more, or null when the value is anything else.
 * Written by hand rather than with parseInt, which reads '10.5' as 10 and
 * 'abc' as NaN without ever saying that it was given nonsense.
 */
function wholeNumber(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * Read limit and offset from a query string.
 * @param {object} query Express req.query
 * @param {{ defaultLimit: number, maxLimit: number, maxOffset: number }} limits
 * @returns {{ limit: number, offset: number, refusal: string|null }}
 */
export function readPaging(query = {}, limits) {
  const { defaultLimit, maxLimit, maxOffset } = limits;
  const limit = wholeNumber(query.limit, defaultLimit);
  const offset = wholeNumber(query.offset, 0);

  if (limit === null || offset === null) {
    return { limit: defaultLimit, offset: 0, refusal: NOT_A_WHOLE_NUMBER };
  }
  if (offset > maxOffset) {
    return { limit: defaultLimit, offset: 0, refusal: TOO_DEEP };
  }
  return { limit: Math.min(limit, maxLimit), offset, refusal: null };
}
