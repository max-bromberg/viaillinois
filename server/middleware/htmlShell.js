import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderShell } from '../lib/seo/render.js';
import { describePage } from '../services/seoPages.js';
import { originOf } from '../routes/seo.js';

/**
 * Serve the application shell with this page's own metadata in it.
 *
 * VIA sends one document for every address and the browser builds the page
 * from it. That is fine for a person and useless for a search engine: every
 * address returned the same title, the same description and an empty body, so
 * an event page had nothing in it to index and nothing linking to it.
 *
 * This fills the shell in before sending it. The application replaces the
 * summary when it starts, so a crawler and a person are shown the same thing.
 *
 * @param {string} distPath directory holding the built client
 */
/**
 * The document names the hashed files this build produced, so a copy kept from
 * before a deploy asks for files that are no longer there. It may be stored and
 * has to be checked every time, which costs a request that answers 304 and not
 * much else, while the files it names are kept forever.
 */
const CACHE_CONTROL = 'no-cache';

export function createHtmlShellHandler(distPath) {
  const shellPath = join(distPath, 'index.html');
  // Read once. The file only changes when a new build is deployed, and a
  // deploy replaces the process.
  const shell = readFileSync(shellPath, 'utf8');

  return async function serveHtmlShell(req, res, next) {
    try {
      const site = originOf(req);
      const page = await describePage(req.path, site);
      res.set('Cache-Control', CACHE_CONTROL);
      res.type('html').send(renderShell(shell, {
        ...page,
        // A PNG, because no social platform renders the SVG logo.
        image: page.image ?? `${site}/og-card.png`,
      }));
    } catch (err) {
      // Metadata is worth having and never worth failing a page load for.
      console.error('could not describe page for SEO:', err.message);
      try {
        res.set('Cache-Control', CACHE_CONTROL);
        res.type('html').send(shell);
      } catch { next(err); }
    }
  };
}
