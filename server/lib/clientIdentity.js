/**
 * Who is asking.
 *
 * Requests arrive through Cloudflare and then through an Nginx Proxy Manager
 * container, which appends its own view of the peer to X-Forwarded-For. The
 * last entry of that header is therefore a Cloudflare edge address rather than
 * a visitor, and a budget keyed on it would bucket everybody behind that edge
 * into one counter. CF-Connecting-IP is written by Cloudflare and passed
 * through unchanged, so it is preferred wherever it is present.
 *
 * This is trustworthy only because Nginx Proxy Manager accepts connections
 * only from Cloudflare's published ranges. A client able to reach the origin
 * directly could write that header itself, and no code here could tell, because
 * the socket peer Express sees is always the proxy container. The restriction
 * is recorded in docs/deployment.md as an invariant of the deployment.
 */

/** Loose but sufficient: it separates an address from a hostname or a lie. */
const LOOKS_LIKE_ADDRESS = /^[0-9a-fA-F.:]+$/;

function firstValid(...candidates) {
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value && LOOKS_LIKE_ADDRESS.test(value)) return value;
  }
  return 'unknown';
}

/**
 * The visitor's address, as well as it can be known.
 * @param {import('express').Request} req
 * @returns {string} An address, or the string 'unknown' when none can be read.
 */
export function clientIp(req) {
  const headers = req.headers || {};
  const forwarded = typeof headers['x-forwarded-for'] === 'string'
    ? headers['x-forwarded-for'].split(',')[0]
    : '';
  return firstValid(headers['cf-connecting-ip'], forwarded, req.socket?.remoteAddress);
}
