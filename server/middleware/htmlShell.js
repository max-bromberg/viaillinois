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

/**
 * How long a crawler is asked to wait before trying a page VIA could not
 * describe. Long enough that a database restarting is over, short enough that
 * nothing sits in a search engine's queue for an afternoon.
 */
const RETRY_AFTER_SECONDS = 120;

export function createHtmlShellHandler(distPath) {
  const shellPath = join(distPath, 'index.html');
  // Read once. The file only changes when a new build is deployed, and a
  // deploy replaces the process.
  const shell = readFileSync(shellPath, 'utf8');

  return async function serveHtmlShell(req, res, next) {
    try {
      const site = originOf(req);
      const page = await describePage(req.path, site);

      /*
       * A page whose lookup failed is a page VIA could not describe, not a page
       * that is gone. Answered 200 it would have to carry either a description
       * of nothing or noindex, and noindex is the one instruction Google acts
       * on at once and takes weeks to undo, so a minute of the database being
       * away could cost the site its event pages. A 503 says come back. The
       * application is still sent, because a person who followed the link is
       * better off with a page that retries than with a blank one.
       */
      if (page.unavailable) {
        res.status(503);
        res.set('Retry-After', String(RETRY_AFTER_SECONDS));
        res.set('Cache-Control', 'no-store');
      } else {
        res.set('Cache-Control', CACHE_CONTROL);
      }

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
