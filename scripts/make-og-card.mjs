/**
 * Render the sharing card used as og:image.
 *
 * Social networks and chat apps will not render an SVG, which is what VIA was
 * previously offering them, so a link posted anywhere showed no image at all.
 * This produces a PNG at the size those platforms expect.
 *
 * Run it when the branding changes:
 *   node scripts/make-og-card.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'server', 'package.json'));
const { chromium } = require('playwright');

const OUT = join(here, '..', 'client', 'public', 'og-card.png');

// Illinois blue and orange, the same pair the site uses for the board behind
// the page: graphite structure, current in orange.
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; background: #0d1b33; color: #f6f7f9;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex; flex-direction: column; justify-content: center;
    padding: 88px; position: relative; overflow: hidden;
  }
  svg.board { position: absolute; inset: 0; width: 100%; height: 100%; }
  h1 { font-size: 104px; letter-spacing: -3px; font-weight: 800; line-height: 1; }
  h1 span { color: #e84a27; }
  p.lede { font-size: 38px; margin-top: 28px; max-width: 800px; line-height: 1.28; color: #c9d2e0; }
  p.foot { font-size: 26px; margin-top: 44px; color: #8fa0ba; letter-spacing: 0.5px; }
</style></head><body>
  <svg class="board" viewBox="0 0 1200 630" fill="none">
    <g stroke="#2b3f60" stroke-width="2">
      <path d="M900 40 H1090 l24 24 V300" />
      <path d="M980 130 H1130 l24 24 V420" />
      <path d="M860 250 H1040 l24 24 V560" />
      <path d="M1010 470 H1160" />
    </g>
    <g stroke="#e84a27" stroke-width="2.5" opacity="0.85">
      <path d="M940 350 H1080 l24 24 V520" />
    </g>
    <g fill="#e84a27">
      <circle cx="940" cy="350" r="6" /><circle cx="1104" cy="520" r="6" />
    </g>
    <g fill="#2b3f60">
      <circle cx="900" cy="40" r="5" /><circle cx="980" cy="130" r="5" />
      <circle cx="860" cy="250" r="5" /><circle cx="1160" cy="470" r="5" />
    </g>
  </svg>
  <h1>VIA<span>.</span></h1>
  <p class="lede">Every event from ECE student organizations at Illinois, in one place.</p>
  <p class="foot">viaillinois.com</p>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: OUT });
await browser.close();
console.log(`wrote ${OUT}`);
