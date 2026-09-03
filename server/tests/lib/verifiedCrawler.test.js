import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isVerifiedCrawler, resetCrawlerCache } from '../../lib/verifiedCrawler.js';

/**
 * A user agent string is a claim, not evidence, and blocking on one catches
 * honest tools while missing dishonest ones. Forward confirmed reverse DNS is
 * evidence: the address resolves to a name in the crawler's own domain, and
 * that name resolves back to the same address. Only the operator of that
 * domain can arrange both halves.
 *
 * Getting this wrong costs VIA its search results, which would be a worse
 * outcome than being scraped, so it is tested more carefully than its size
 * suggests.
 */
const GOOGLE_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

function dnsThatSays(reverseName, forwardAddresses) {
  return {
    reverse: vi.fn().mockResolvedValue(reverseName ? [reverseName] : []),
    lookup: vi.fn().mockResolvedValue(forwardAddresses.map(address => ({ address }))),
  };
}

beforeEach(() => resetCrawlerCache());

describe('isVerifiedCrawler', () => {
  it('accepts a crawler whose name and address confirm each other', async () => {
    const dns = dnsThatSays('crawl-66-249-66-1.googlebot.com', ['66.249.66.1']);
    expect(await isVerifiedCrawler('66.249.66.1', GOOGLE_UA, dns)).toBe(true);
  });

  it('rejects an impostor claiming to be a crawler', async () => {
    const dns = dnsThatSays('host.example.com', ['203.0.113.9']);
    expect(await isVerifiedCrawler('203.0.113.9', GOOGLE_UA, dns)).toBe(false);
  });

  it('rejects a name in the right domain that does not resolve back', async () => {
    const dns = dnsThatSays('fake.googlebot.com', ['203.0.113.9']);
    expect(await isVerifiedCrawler('66.249.66.1', GOOGLE_UA, dns)).toBe(false);
  });

  it('does not ask DNS anything about an ordinary browser', async () => {
    const dns = dnsThatSays('anything.googlebot.com', ['1.1.1.1']);
    expect(await isVerifiedCrawler('1.1.1.1', 'Mozilla/5.0 (Macintosh)', dns)).toBe(false);
    expect(dns.reverse).not.toHaveBeenCalled();
  });

  it('accepts Bing on the same evidence', async () => {
    const dns = dnsThatSays('msnbot-40-77-1-1.search.msn.com', ['40.77.1.1']);
    expect(await isVerifiedCrawler('40.77.1.1', 'Mozilla/5.0 (compatible; bingbot/2.0)', dns)).toBe(true);
  });

  it('trusts Cloudflare when it has already verified the bot', async () => {
    const dns = dnsThatSays(null, []);
    expect(await isVerifiedCrawler('66.249.66.1', GOOGLE_UA, { ...dns, cloudflareVerified: true })).toBe(true);
    expect(dns.reverse).not.toHaveBeenCalled();
  });

  it('asks DNS once and remembers the answer', async () => {
    const dns = dnsThatSays('crawl-66-249-66-1.googlebot.com', ['66.249.66.1']);
    await isVerifiedCrawler('66.249.66.1', GOOGLE_UA, dns);
    await isVerifiedCrawler('66.249.66.1', GOOGLE_UA, dns);
    expect(dns.reverse).toHaveBeenCalledTimes(1);
  });

  it('treats a DNS failure as not verified rather than as an error', async () => {
    const dns = {
      reverse: vi.fn().mockRejectedValue(new Error('SERVFAIL')),
      lookup: vi.fn(),
    };
    expect(await isVerifiedCrawler('66.249.66.1', GOOGLE_UA, dns)).toBe(false);
  });
});
