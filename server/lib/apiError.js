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

/** The code that belongs with a status the shared middleware answered with. */
const CODE_FOR_STATUS = {
  400: ERROR_CODES.INVALID,
  401: ERROR_CODES.UNAUTHORIZED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  409: ERROR_CODES.CONFLICT,
  503: ERROR_CODES.BUSY,
};

/**
 * Run one of the website's own middlewares and give its refusal a code.
 *
 * requireRSOAdmin and its neighbours are the reason the bot cannot decide
 * anything for itself: they are the rules the dashboard applies, and they are
 * used here unchanged so that the two surfaces cannot drift apart. What they
 * answer is the public API's refusal, a sentence and nothing else, so this
 * wrapper adds the machine readable code the bot reads and leaves everything
 * else exactly as it was.
 *
 * @param {import('express').RequestHandler} middleware
 * @returns {import('express').RequestHandler}
 */
export function withErrorCode(middleware) {
  return function coded(req, res, next) {
    const json = res.json.bind(res);
    res.json = body => {
      if (body && typeof body === 'object' && typeof body.error === 'string' && body.code === undefined) {
        return json({ ...body, code: CODE_FOR_STATUS[res.statusCode] ?? ERROR_CODES.INVALID });
      }
      return json(body);
    };
    middleware(req, res, next);
  };
}
