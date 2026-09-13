/**
 * The design system's rules, read out of the approved reference stylesheet.
 *
 * docs/design/11-implementation.md makes docs/design/reference/foundation.css normative:
 * every value in the client comes from it, and where a written document and the
 * stylesheet disagree the stylesheet wins. Retyping its rules into the client
 * would put the two out of step the first time either was edited, so they are
 * read from the file instead, in the order they appear there, because that order
 * is the cascade the reference render is drawn with.
 *
 * The reference stylesheet also draws its own page: a masthead, section
 * headings, a table of contrast readings. Those rules stay behind. What comes
 * across is named here, one list per step of the implementation, so that what
 * the client carries is a decision somebody made rather than whatever happened
 * to be in the file.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The rules the primitives need, by the exact selector text of each rule. */
export const PRIMITIVE_SELECTORS = [
  '.mono',
  '.disp',
  '.cond',
  '.wide',
  '.cut',
  '.cutbl',
  '.pad',
  '.pad.hollow',
  '.pad.lit',
  '.hl',
  '.hl::before',
  '.hl.off',
  '.hl.off::before',
  '.hlrow',
  '.ocut',
  '.ocut::before',
  '@keyframes pulse',
  '@keyframes settle',
  '@keyframes drift',
  'svg.i',
  // Every one of the five movements stops for anybody whose system asks for it.
  '@media (prefers-reduced-motion: reduce)',
  // The tracking block at the end of the reference, which zeroes the condensed
  // cut and lifts the large display roles. It names surfaces that do not exist
  // in the client yet, and it is copied whole so that each one is set correctly
  // the moment it lands rather than being tracked down afterwards.
  '.mast h1 b,.greet h2 b,.poster h1,.kiosk h1,.tspec .row1',
  '.mast h1,.greet h2,.sh h2,.cond,.tspec .big,.ev .b .title',
  '.day .dh b,.ev .t,.exam .code,.mt .head h1,.poster .when .big,.kiosk .whenk .big,.mast .clock .t,.greet .clock .t,.kiosk .k-top .t,.tspec .num,.sky .lab b,.ribbon .wkc b,.greet .line b',
];

/**
 * Rules whose selector lists several things, of which the client wants only
 * some. The value is the selector the client writes instead.
 */
export const NARROWED = new Map([
  ['.hl:focus-visible,.hl.focus,.check:focus-visible,.check.focus,.dial:focus-visible,.dial.focus,.tswitch:focus-visible,.tswitch.focus,.pad:focus-visible', '.hl:focus-visible,.check:focus-visible,.dial:focus-visible,.tswitch:focus-visible,.pad:focus-visible'],
  ['.check,.rail .orgs span,.hl', '.check,.hl'],
  ['.rail .orgs .pad,.check .pad,.hl .pad', '.check .pad,.hl .pad'],
]);

/**
 * Every top level rule in a stylesheet, in the order it is written, as a
 * selector and the text of the whole rule.
 *
 * The parser is deliberately small. It handles what this one file contains:
 * block comments, ordinary rules, and at rules with a block. It does not handle
 * strings holding braces, because the file has none.
 */
export function rulesOf(css) {
  const rules = [];
  let at = 0;
  while (at < css.length) {
    if (css.startsWith('/*', at)) {
      const end = css.indexOf('*/', at + 2);
      at = end === -1 ? css.length : end + 2;
      continue;
    }
    const character = css[at];
    if (character === undefined || /\s/.test(character)) { at += 1; continue; }

    const open = css.indexOf('{', at);
    if (open === -1) break;
    let depth = 1;
    let cursor = open + 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    const selector = css.slice(at, open).replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s*\n\s*/g, ' ');
    rules.push({ selector, text: `${selector}${css.slice(open, cursor)}` });
    at = cursor;
  }
  return rules;
}

/**
 * The rules for a set of selectors, in the reference's own order, with any
 * later rule for the same selector kept after the earlier one so that the
 * cascade the reference is drawn with comes across intact.
 *
 * @param {string} css the reference stylesheet
 * @param {string[]} selectors
 * @returns {{ selector: string, text: string }[]}
 */
export function collect(css, selectors) {
  const wanted = new Set(selectors);
  const narrowed = new Set(NARROWED.keys());
  return rulesOf(css)
    .filter(rule => wanted.has(rule.selector) || narrowed.has(rule.selector))
    .map(rule => (narrowed.has(rule.selector)
      ? { selector: NARROWED.get(rule.selector), text: rule.text.replace(rule.selector, NARROWED.get(rule.selector)) }
      : rule));
}

/** The reference stylesheet, as the client reads it. */
export function reference(path = resolve(process.cwd(), '../docs/design/reference/foundation.css')) {
  return readFileSync(path, 'utf8');
}
