/**
 * Where to come back to once somebody has signed in.
 *
 * A person who follows the Discord link address while signed out has to sign
 * in first, and signing in through the university's identity provider is a
 * round trip that ends at the front page. The address they were headed for is
 * remembered here so that the application can put them back on it.
 *
 * It is kept in the browser's own storage, which survives the tab being closed
 * and the browser being restarted, so it is stored with the time it was
 * written and ignored once that time is old. Taking it as it is read is not
 * enough on its own: a path remembered weeks ago and never taken would still
 * be there, and the next sign in would land on a link page the person had long
 * forgotten about.
 *
 * Only paths on this site are kept, so nothing here can be turned into a
 * redirect to somewhere else.
 */

const KEY = 'via_after_sign_in';

/** How long a remembered path is worth returning to, which is one sign in. */
export const AFTER_SIGN_IN_MINUTES = 10;

/** Whether a value is a path on this site rather than an address elsewhere. */
function isOwnPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

/** Remember a path on this site. Anything else is ignored. */
export function rememberAfterSignIn(path) {
  if (!isOwnPath(path)) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // A browser that refuses storage still signs people in, it just lands
    // them on the front page afterwards.
  }
}

/** The remembered path, forgotten as it is handed over, or null when it is stale. */
export function takeAfterSignIn() {
  try {
    const stored = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    if (typeof stored !== 'string') return null;

    const { path, at } = JSON.parse(stored);
    if (!isOwnPath(path)) return null;
    if (!Number.isFinite(at) || Date.now() - at > AFTER_SIGN_IN_MINUTES * 60_000) return null;
    return path;
  } catch {
    // Either the browser refused storage or what was under the key is not
    // something this wrote. Both mean the front page.
    return null;
  }
}
