import { createHash, randomBytes } from 'node:crypto';

/**
 * The token in a personal calendar address.
 *
 * Written here rather than in either route because both ends of the
 * subscription need the same reading of it: the internal endpoint makes a
 * token and stores its hash, and the public endpoint hashes what a calendar
 * application asked with and looks for the same value. A token is thirty two
 * random bytes, written in the URL safe alphabet so it survives being pasted
 * into a phone, and it is stored only as a SHA-256 digest, so the row is
 * useless to anybody who reads the table.
 */

/** Thirty two random bytes as forty three URL safe characters. */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A new token, which nobody has seen before and nobody will see again. */
export function newCalendarToken() {
  return randomBytes(32).toString('base64url');
}

/** What the row holds, which is never the token itself. */
export function hashCalendarToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Where a phone subscribes, which is the website rather than the API. */
export function calendarAddress(token) {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/calendar/personal/${token}.ics`;
}
