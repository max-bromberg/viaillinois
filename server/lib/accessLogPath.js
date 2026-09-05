/**
 * The address as the access log may keep it.
 *
 * Three of VIA's addresses carry a credential in the address itself. A
 * personal calendar address is the whole of the proof that a calendar belongs
 * to somebody, the Discord callback carries the authorization code and the
 * signed state, and a link session identifier is the handshake the bot sent
 * one person. An access log is kept for a long time and read by more people
 * than the person the address belongs to, so each of these is taken out of the
 * line before it is written. What is left is enough to see which endpoint was
 * asked for and how it answered, which is what the log is for.
 */

/** The personal calendar file, whose name is the token. */
const CALENDAR = /^\/calendar\/personal\/[^/?#]+$/;

/** The link page and the address the page reads, whose next segment is the session. */
const LINK_PAGE = /^(\/api\/v1)?\/link\/discord\/[^/?#]+/;

/** The Discord callback, whose query string carries the code and the state. */
const DISCORD_CALLBACK = '/auth/discord/callback';

/**
 * @param {string|undefined|null} url the address as the request carried it
 * @returns {string} the address with any credential in it replaced
 */
export function redactedUrl(url) {
  if (typeof url !== 'string' || url === '') return '-';

  const [path] = url.split('#');
  const [pathname] = path.split('?');

  if (pathname === DISCORD_CALLBACK) return DISCORD_CALLBACK;

  if (CALENDAR.test(pathname)) return '/calendar/personal/[token].ics';

  if (LINK_PAGE.test(pathname)) {
    return pathname.replace(
      /^((?:\/api\/v1)?\/link\/discord)\/[^/?#]+/,
      (_match, prefix) => `${prefix}/[session]`,
    );
  }

  return url;
}
