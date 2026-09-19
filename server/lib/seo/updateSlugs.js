/**
 * Which platform updates have actually been written.
 *
 * An update is a markdown file under the client's content directory, and its
 * filename without the extension is the address it is read at. The client
 * gathers them at build time with import.meta.glob, so it has always known
 * which ones exist. The server did not, and it was answering for any address
 * of that shape that it was a page worth indexing, with a canonical address
 * pointing at itself. Anybody could hand a crawler an address nobody had ever
 * written an update for and VIA would agree it was real.
 *
 * The filenames are read once, the way the HTML shell is read once: they
 * change when a new build is deployed and not while the process is running.
 *
 * A directory that cannot be read answers with no updates rather than
 * throwing. That is the safe direction: an update whose address is not
 * recognised is served the ordinary fallback, which asks not to be indexed,
 * and the page itself is still drawn by the client either way. The opposite
 * mistake, indexing everything, is the one worth avoiding.
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Where the updates are written, relative to this file.
 *
 * The server runs from server/ in the repository and from /app/server in the
 * image, and the client sits beside it in both, so one relative path answers
 * for both. Dockerfile.server copies this directory in for that reason.
 */
export const UPDATES_DIRECTORY = join(__dirname, '../../../client/src/content/updates');

/** Read the slugs off disk, which is done once below and again by the tests. */
export function readUpdateSlugs(directory = UPDATES_DIRECTORY) {
  try {
    return new Set(
      readdirSync(directory)
        .filter(name => name.endsWith('.md'))
        .map(name => name.replace(/\.md$/, '')),
    );
  } catch {
    return new Set();
  }
}

const slugs = readUpdateSlugs();

/** Whether an update was written under this slug. */
export function isUpdateSlug(slug) {
  return slugs.has(slug);
}
