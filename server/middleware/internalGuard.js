import { createHash, timingSafeEqual } from 'node:crypto';
import { sendApiError, ERROR_CODES } from '../lib/apiError.js';

/**
 * Who may reach the internal service API: the bot, and nobody else.
 *
 * The bot is on the same private container network as the web platform and
 * presents a service token both containers read from the stack's environment.
 * Three refusals, each saying as little as it can:
 *
 * - No token configured means no internal API. A deployment without the bot
 *   answers 404 to the whole prefix, so the prefix does not exist to probe.
 * - A request that arrived through the reverse proxy came from the internet.
 *   The proxy is not supposed to forward this prefix, and if it ever does, the
 *   right token must still not open the door, because the token travels
 *   between two containers and was never meant to cross the edge. 404 again.
 * - A missing or wrong token answers 401 with a code and no more, and is
 *   counted in the denial log, so a probe against this prefix shows up on the
 *   admin page under its own reason.
 *
 * The comparison hashes both sides first, so a token of the wrong length is
 * compared in the same time as a token of the right length, and the equality
 * itself is constant time.
 */

/** Headers only the reverse proxy chain writes. Their presence means the edge. */
const PROXY_HEADERS = ['x-forwarded-for', 'cf-connecting-ip'];

function sameToken(presented, expected) {
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearerToken(req) {
  const header = req.headers?.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer (.*)$/.exec(header);
  return match ? match[1] : null;
}

/**
 * @param {{ token: string, onDenied: (denial: object) => void }} options
 * @returns {import('express').RequestHandler}
 */
export function createInternalGuard({ token, onDenied }) {
  return function internalGuard(req, res, next) {
    const route = (req.baseUrl || '') + req.path;
    const deny = (status, code, message) => {
      onDenied({ reason: 'internal_unauthorized', route, authenticated: false, client: req.clientIp });
      return sendApiError(res, status, code, message);
    };

    if (!token) return deny(404, ERROR_CODES.NOT_FOUND, 'Not found.');
    if (PROXY_HEADERS.some(name => req.headers?.[name] !== undefined)) {
      return deny(404, ERROR_CODES.NOT_FOUND, 'Not found.');
    }

    const presented = bearerToken(req);
    if (presented === null || !sameToken(presented, token)) {
      return deny(401, ERROR_CODES.UNAUTHORIZED, 'A service token is required.');
    }
    next();
  };
}

/** The production wiring, reading the token from the environment. */
export function createProductionInternalGuard({ onDenied }) {
  return createInternalGuard({ token: process.env.BOT_SERVICE_TOKEN || '', onDenied });
}
