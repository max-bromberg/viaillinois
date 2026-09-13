/**
 * Copy the design system's rules from the approved reference stylesheet into the
 * client's stylesheet, between the markers.
 *
 * Run with `node scripts/syncDesignCss.js` from the client directory after a
 * change to docs/design/reference/foundation.css. tests/lib/designCss.test.js
 * derives the same block and compares, so a stylesheet that has drifted from the
 * reference fails the gate rather than reaching a screen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { collect, reference, PRIMITIVE_SELECTORS } from './designRules.js';

export const OPENS = '/* >>> design system: copied from docs/design/reference/foundation.css by scripts/syncDesignCss.js */';
export const CLOSES = '/* <<< design system */';

/** The block the client's stylesheet should carry, derived from the reference. */
export function designBlock(css = reference()) {
  const rules = collect(css, PRIMITIVE_SELECTORS).map(rule => rule.text);
  return [OPENS, ...rules, CLOSES].join('\n');
}

/** Put the derived block into a stylesheet, replacing whatever was between the markers. */
export function withDesignBlock(appCss, block = designBlock()) {
  const opensAt = appCss.indexOf(OPENS);
  const closesAt = appCss.indexOf(CLOSES);
  if (opensAt === -1 || closesAt === -1) {
    throw new Error('src/app.css has no design system markers to write between');
  }
  return appCss.slice(0, opensAt) + block + appCss.slice(closesAt + CLOSES.length);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = resolve(process.cwd(), 'src/app.css');
  writeFileSync(path, withDesignBlock(readFileSync(path, 'utf8')));
  console.log('src/app.css now carries the design system rules from the reference stylesheet');
}
