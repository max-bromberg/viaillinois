import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardSvg, CARD_WIDTH, CARD_HEIGHT } from './shareCard.js';

/**
 * Turning the card's drawing into the picture a reader actually fetches.
 *
 * This is the thin half. Everything that decides what a card says is in
 * shareCard.js and is checked without any of this.
 *
 * Chromium is used because the image already ships in this container for the
 * Tableau session, so rasterising here costs no new dependency and no new
 * megabytes. It is still the most expensive thing this service does, so three
 * things keep it rare: one browser is launched and reused rather than one per
 * request, only one card is drawn at a time, and every card is held in memory
 * once it has been drawn. A link doing the rounds is then one render and then
 * a great many cache hits, and the edge cache in front of this means most
 * readers never arrive at all.
 */

const here = dirname(fileURLToPath(import.meta.url));

/** The faces the design uses, embedded so the picture does not depend on a network. */
const FONT_FILES = [
  ['Bricolage Grotesque', 'BricolageGrotesque-latin.woff2', '200 800'],
  ['IBM Plex Mono', 'IBMPlexMono-400-latin.woff2', '400'],
];

let fontCss = null;

async function embeddedFonts() {
  if (fontCss !== null) return fontCss;
  const faces = [];
  for (const [family, file, weight] of FONT_FILES) {
    try {
      const bytes = await readFile(resolve(here, '../../client/public/fonts', file));
      faces.push(
        `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;`
        + `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2")}`,
      );
    } catch {
      // A missing face is not a reason to have no picture. The drawing names a
      // system fallback beside every family it asks for.
    }
  }
  fontCss = faces.join('');
  return fontCss;
}

let browser = null;
let drawing = Promise.resolve();

/** The cards already drawn, by the key they were drawn for. */
const cache = new Map();
const CACHE_MAX = 200;

/**
 * The renders happening right now, by the key each one is for.
 *
 * Serialising renders keeps two browsers from opening at once, and it is not
 * the same as sharing one. The cache is written when a render finishes, so
 * every caller that arrived while the first was still drawing missed it and
 * queued an identical render of its own. A pasted link is fetched
 * independently by every unfurler that sees it and by the reader, and none of
 * them share a cold entry at the edge, so the first post of a link was a queue
 * of identical renders with a request held open for each.
 */
const inFlight = new Map();

/**
 * How long one card may take before it is given up on.
 *
 * The page settle had no bound, so a page that never finished settling held the
 * queue for the life of the process and every card on the site stopped being
 * drawn. A card is worth a few seconds and no more: a reader whose unfurler
 * gets nothing sees a link without a picture, which is the same thing they saw
 * before any of this existed.
 */
const RENDER_TIMEOUT_MS = () => parseInt(process.env.CARD_RENDER_TIMEOUT_MS || '10000', 10);

/** Whichever comes first, the work or the clock. */
function withTimeout(work, ms, what) {
  let timer;
  const clock = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} took too long and was given up on`)), ms);
  });
  return Promise.race([work, clock]).finally(() => clearTimeout(timer));
}

async function sharedBrowser() {
  if (browser?.isConnected()) return browser;
  browser = await chromium.launch({ args: ['--no-sandbox'] });
  return browser;
}

/**
 * What makes one card different from another.
 *
 * Everything the drawing reads, so an event whose title or room is edited gets
 * a new picture rather than the one drawn before the edit.
 */
function keyOf(event) {
  if (!event) return 'shared';
  return [
    event.event_id, event.title, event.rso_name,
    event.start_time, event.building, event.room_number, event.cancelled_at,
  ].join('|');
}

async function draw(event) {
  const page = await (await sharedBrowser()).newPage({
    viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(
      `<style>html,body{margin:0;padding:0}${await embeddedFonts()}</style>${cardSvg(event)}`,
      { waitUntil: 'load' },
    );
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

/**
 * The card for one event, or the shared one, as a PNG.
 *
 * Renders are serialised. Two links pasted at once would otherwise open two
 * browsers inside a container with a memory ceiling, which is the one way this
 * could take the platform down rather than merely be slow.
 */
export async function renderCard(event = null) {
  const key = keyOf(event);
  const held = cache.get(key);
  if (held) return held;

  // A render already going for this exact card is the answer to this call too.
  const already = inFlight.get(key);
  if (already) return already;

  const mine = drawing
    .then(() => withTimeout(draw(event), RENDER_TIMEOUT_MS(), 'drawing a card'),
          () => withTimeout(draw(event), RENDER_TIMEOUT_MS(), 'drawing a card'))
    .then(png => {
      // Oldest out first, which for cards is near enough to least wanted.
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, png);
      return png;
    })
    .finally(() => { inFlight.delete(key); });

  inFlight.set(key, mine);
  // The chain advances on either settlement, so one failure cannot wedge it.
  drawing = mine.catch(() => {});
  return mine;
}

/** Drop everything held, and the browser with it. For tests and for shutdown. */
export async function resetCardCache() {
  cache.clear();
  inFlight.clear();
  fontCss = null;
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
