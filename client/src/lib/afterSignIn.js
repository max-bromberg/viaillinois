/**
 * Where to come back to once somebody has signed in.
 *
 * A person who follows the Discord link address while signed out has to sign
 * in first, and signing in through the university's identity provider is a
 * round trip that ends at the front page. The address they were headed for is
 * remembered here so that the application can put them back on it, and it is
 * taken rather than read, so a stale address cannot send somebody somewhere
 * they did not ask to go weeks later.
 *
 * Only paths on this site are kept, so nothing here can be turned into a
 * redirect to somewhere else.
 */

const KEY = 'via_after_sign_in';

/** Remember a path on this site. Anything else is ignored. */
export function rememberAfterSignIn(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return;
  try {
    window.localStorage.setItem(KEY, path);
  } catch {
    // A browser that refuses storage still signs people in, it just lands
    // them on the front page afterwards.
  }
}

/** The remembered path, forgotten as it is handed over. */
export function takeAfterSignIn() {
  try {
    const path = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}
