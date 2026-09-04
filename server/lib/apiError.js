/**
 * The error shape the internal service API answers with.
 *
 * The public API answers a refusal with a sentence. The bot needs to choose its
 * own wording for the person in Discord, so beside the sentence it gets a
 * machine readable code, and it never has to parse prose to tell a missing
 * link from a missing event.
 */

/** Every code the internal service API can answer with. */
export const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  NOT_LINKED:   'not_linked',
  FORBIDDEN:    'forbidden',
  NOT_FOUND:    'not_found',
  INVALID:      'invalid',
  BUSY:         'busy',
  CONFLICT:     'conflict',
});

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code One of ERROR_CODES.
 * @param {string} message A complete sentence.
 */
export function sendApiError(res, status, code, message) {
  return res.status(status).json({ error: message, code });
}
