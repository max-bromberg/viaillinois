/**
 * What may store a response, and for how long.
 *
 * VIA is served through a CDN, so these headers decide how much of the site
 * the edge can answer on its own and, more importantly, what it must never
 * keep. The default for the API is that nothing is kept, because most of what
 * it answers depends on who is asking: a board member sees their own RSO's
 * internal events and their members' addresses, and a shared cache holding one
 * of those answers would hand it to the next person along.
 *
 * A route whose answer is the same for everybody says so for itself, by being
 * mounted behind publicFor.
 */

import { sep } from 'node:path';

/** Anything that can differ per person is nobody's to store. */
export function privateByDefault(_req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  next();
}

/**
 * A response every visitor gets the same answer to.
 *
 * The browser is given a short life or none at all, and the edge a longer one,
 * so a change reaches people as soon as the edge revalidates rather than
 * waiting for every browser to expire its own copy. stale-while-revalidate
 * lets the edge answer immediately from what it has while it fetches the new
 * one behind the reader's back.
 *
 * @param {{ browserSeconds?: number, edgeSeconds: number, staleSeconds?: number }} lifetime
 */
export function publicFor({ browserSeconds = 0, edgeSeconds, staleSeconds = edgeSeconds * 10 }) {
  const value = `public, max-age=${browserSeconds}, s-maxage=${edgeSeconds}, `
    + `stale-while-revalidate=${staleSeconds}`;
  return (_req, res, next) => {
    res.set('Cache-Control', value);
    next();
  };
}

/**
 * How long a built file may be kept.
 *
 * Vite puts a content hash in the name of everything under assets, so one of
 * those names never means two different files and a browser never has to ask
 * about it twice. Everything else, the logo and the sharing card among them,
 * is served under a stable name and has to be checked now and then, though it
 * can be shown from the copy at hand while that check happens.
 *
 * @param {string} filePath
 */
export function cacheControlForStaticFile(filePath) {
  return filePath.includes(`${sep}assets${sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=3600, stale-while-revalidate=86400';
}
