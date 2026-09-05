import { createSlidingBudget } from '../lib/slidingBudget.js';
import { isVerifiedCrawler as defaultIsVerifiedCrawler } from '../lib/verifiedCrawler.js';
import { rowsInBody } from '../lib/rowsInBody.js';
import { sendBudgetExhausted } from '../lib/busyResponse.js';
import { clientIp } from '../lib/clientIdentity.js';

/**
 * How much of the public corpus one anonymous caller may take.
 *
 * Two budgets, and the second is the one that matters. A request rate limit
 * catches a client that hammers, and misses a client that paces itself at one
 * request a second and walks the whole corpus over a night. A row budget
 * measures what was taken rather than how it was asked for, so the patient
 * client is caught by the same number as the impatient one. Capping the depth
 * of paging, done in lib/pagination.js, is what forces a client that wants
 * everything to spend rows to get it.
 *
 * Every consequence here is one minute of waiting. Nothing bans, nothing
 * escalates, nothing outlives its window. On a campus network a single address
 * may be a lecture hall rather than a collector, and a design that cannot tell
 * those apart must not be able to do lasting harm to either.
 */

/**
 * Paths that are never counted, each for its own reason.
 *
 * These are matched against the whole path rather than against req.path. This
 * middleware is mounted on /api/v1, and Express strips a mount path from
 * req.path, so a prefix written in full would never match anything and the
 * exemptions below would all be dead.
 */
const EXEMPT_PREFIXES = [
  '/health',
  // A lobby display polls from one address forever, which is exactly the shape
  // a naive budget would punish. It is cached at the edge and returns at most
  // fifty rows.
  '/api/v1/kiosk',
  // The same tiny answer for everybody, cached for an hour at the edge.
  '/api/v1/semester',
  // A calendar application on a phone fetches one person's subscription every
  // few hours forever, from an address that is the whole of its credential.
  // Counting it would spend one student's budget on their own calendar.
  '/calendar/personal',
];

/**
 * @param {{
 *   requestsPerWindow: number, requestWindowMs: number,
 *   rowsPerWindow: number, rowWindowMs: number,
 *   retryAfterSeconds: number,
 *   onDenied: (denial: object) => void,
 *   isVerifiedCrawler?: (ip: string, userAgent: string, deps: object) => Promise<boolean>,
 * }} options
 * @returns {import('express').RequestHandler}
 */
export function createPublicApiBudget({
  requestsPerWindow, requestWindowMs,
  rowsPerWindow, rowWindowMs,
  retryAfterSeconds, onDenied,
  isVerifiedCrawler = defaultIsVerifiedCrawler,
}) {
  const requests = createSlidingBudget({ windowMs: requestWindowMs, max: requestsPerWindow });
  const rows = createSlidingBudget({ windowMs: rowWindowMs, max: rowsPerWindow });

  // Callers who have gone quiet are forgotten, so neither map grows forever.
  const sweep = setInterval(() => { requests.sweep(); rows.sweep(); }, requestWindowMs);
  sweep.unref?.();

  return async function publicApiBudget(req, res, next) {
    // A signed in reader is accountable through a NetID, and the expensive
    // authenticated actions already have their own limits.
    if (req.user) return next();

    // The path as the caller wrote it, which is what the exemptions and the
    // denial log both mean. req.path alone is missing the mount prefix.
    const fullPath = (req.baseUrl || '') + req.path;
    if (EXEMPT_PREFIXES.some(prefix => fullPath.startsWith(prefix))) return next();

    const key = req.clientIp || clientIp(req);

    if (await isVerifiedCrawler(key, req.headers['user-agent'], {
      cloudflareVerified: req.headers['cf-verified-bot'] === 'true',
    })) return next();

    const deny = reason => {
      onDenied({ reason, route: fullPath, authenticated: false, client: key });
      return sendBudgetExhausted(res, retryAfterSeconds);
    };

    const request = requests.consume(key, 1);
    if (!request.allowed) return deny('rate_limited');

    // A caller already over the row budget is refused before the query runs,
    // which is the point: the expensive work is skipped rather than done and
    // then thrown away. Spending zero asks only whether they are already out.
    if (!rows.consume(key, 0).allowed) return deny('row_budget');

    // Rows are only known once the body exists, so the charge is made as the
    // response goes out. It is a charge rather than a spend, because the rows
    // have already been served: refusing the last one to cross the line would
    // only lose the count, and the total would never reach the number that
    // refuses the next request.
    const originalJson = res.json.bind(res);
    res.json = body => {
      rows.charge(key, rowsInBody(body));
      return originalJson(body);
    };

    next();
  };
}

/** The production wiring, reading its numbers from the environment. */
export function createProductionPublicApiBudget({ onDenied }) {
  return createPublicApiBudget({
    requestsPerWindow: parseInt(process.env.PUBLIC_REQUESTS_PER_MINUTE || '120', 10),
    requestWindowMs: 60000,
    rowsPerWindow: parseInt(process.env.PUBLIC_ROWS_PER_HOUR || '5000', 10),
    rowWindowMs: 3600000,
    retryAfterSeconds: parseInt(process.env.BUDGET_RETRY_AFTER_SECONDS || '60', 10),
    onDenied,
  });
}
