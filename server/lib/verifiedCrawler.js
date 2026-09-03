import { promises as dnsPromises } from 'node:dns';

/**
 * Whether a caller really is the search engine crawler it says it is.
 *
 * VIA renders pages specifically to be indexed, so losing search results to an
 * anti-scrape rule would be a worse outcome than being scraped. Crawlers are
 * therefore exempt from the public budgets, which means the check for one has
 * to be evidence rather than a claim.
 *
 * A user agent string is a claim anybody can make. Forward confirmed reverse
 * DNS is evidence: the address has to resolve to a name inside the crawler's
 * own domain, and that name has to resolve back to the same address. Only the
 * operator of the domain can arrange both halves.
 */

/** Domains whose crawlers VIA wants, and the user agent that announces each. */
const CRAWLERS = [
  { agent: /Googlebot/i, suffixes: ['.googlebot.com', '.google.com'] },
  { agent: /bingbot|msnbot/i, suffixes: ['.search.msn.com'] },
];

const CACHE_TTL_MS = parseInt(process.env.CRAWLER_CACHE_TTL_MS || '86400000', 10);
/** address -> { verified: boolean, at: number } */
const cache = new Map();

/** Drop the cache. For tests. */
export function resetCrawlerCache() {
  cache.clear();
}

/**
 * @param {string} ip
 * @param {string} userAgent
 * @param {{ reverse?: Function, lookup?: Function, cloudflareVerified?: boolean,
 *           now?: () => number }} [deps]
 * @returns {Promise<boolean>}
 */
export async function isVerifiedCrawler(ip, userAgent, deps = {}) {
  const {
    reverse = dnsPromises.reverse,
    lookup = dnsPromises.lookup,
    cloudflareVerified = false,
    now = Date.now,
  } = deps;

  const claimed = CRAWLERS.find(crawler => crawler.agent.test(userAgent || ''));
  // Nothing claims to be a crawler, so there is nothing to verify and no
  // reason to spend a DNS round trip on an ordinary reader.
  if (!claimed) return false;

  // Cloudflare has already done this work, against a list of verified bots
  // that is wider and better maintained than the one above.
  if (cloudflareVerified) return true;

  const cached = cache.get(ip);
  if (cached && now() - cached.at < CACHE_TTL_MS) return cached.verified;

  let verified = false;
  try {
    const names = await reverse(ip);
    const name = names.find(candidate =>
      claimed.suffixes.some(suffix => candidate.toLowerCase().endsWith(suffix)));
    if (name) {
      const forward = await lookup(name, { all: true });
      verified = forward.some(entry => entry.address === ip);
    }
  } catch {
    // A resolver that will not answer is not evidence of anything, and a
    // crawler treated as an ordinary reader is only throttled, never blocked.
    verified = false;
  }

  cache.set(ip, { verified, at: now() });
  return verified;
}
