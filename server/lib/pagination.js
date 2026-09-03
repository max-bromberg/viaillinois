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

/**
 * Per route ceilings. Every list endpoint names one of these.
 *
 * A ceiling is here to bound what one request may ask for. It is not here to
 * change what a page already receives, and the difference matters: several of
 * these listings are read by a page that fetches once and draws everything it
 * was given, with no way to ask for a second page. A default below the real
 * size of one of those sets does not paginate it, it hides rows from a page
 * somebody is planning around. Those entries therefore have a default equal to
 * their ceiling, and the ceiling is set above the size the set really reaches.
 *
 * The per request ceiling is not what makes bulk collection impractical in any
 * case. The row budget in middleware/publicApiBudget.js is, because it measures
 * what an anonymous caller was served across a whole hour rather than what it
 * asked for once.
 */
export const PAGING_LIMITS = {
  // The feed pages, and its own control offers twenty at a time.
  events:   { defaultLimit: 50, maxLimit: 100, maxOffset: 5000 },
  // The midterm schedule is one page of every exam still to come, across the
  // seven subjects the poller follows, and it has no second page to ask for.
  midterms: { defaultLimit: 500, maxLimit: 500, maxOffset: 5000 },
  // The scheduler puts every course in one picker. The poller syncs seven
  // subjects across the university, which is well over a thousand rows.
  courses:  { defaultLimit: 5000, maxLimit: 5000, maxOffset: 5000 },
  // Every RSO appears in the feed's filter panel and in the event form.
  rsos:     { defaultLimit: 500, maxLimit: 500, maxOffset: 1000 },
  // The venues search box was serving ten results before this module existed,
  // and this table exists to add a ceiling rather than to change a default.
  venues:   { defaultLimit: 10, maxLimit: 100, maxOffset: 1000 },
  kiosk:    { defaultLimit: 10, maxLimit: 50,  maxOffset: 0 },
  // The calendar asks for every confirmed exam still to come and draws the ones
  // that fall in the week or month it is showing. The query behind it is
  // already narrow, since it returns only confirmed exams that have not
  // finished, and there is nothing to page through.
  confirmedMidterms: { defaultLimit: 500, maxLimit: 500, maxOffset: 0 },
};

/**
 * A whole number of zero or more, or null when the value is anything else.
 * Written by hand rather than with parseInt, which reads '10.5' as 10 and
 * 'abc' as NaN without ever saying that it was given nonsense.
 *
 * An empty value is treated as one that was never sent, because a caller that
 * built its URL from an empty form field is not asking for nonsense. Anything
 * that is not a string or a number is refused outright: a repeated or nested
 * parameter arrives as a list or an object, and Number(['10']) is 10, so
 * reading one of those as a number would be a guess about what the caller
 * meant rather than an answer to what it sent.
 */
function wholeNumber(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
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
