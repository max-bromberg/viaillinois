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
  return collectFor(css, { selectors: [...selectors, ...NARROWED.keys()] });
}


/**
 * The roots of the composed parts, as the reference stylesheet names them. A
 * rule comes across when every selector in its list is one of these or a
 * descendant of one, so that a rule which also dresses the reference page's own
 * document chrome is left behind rather than half applied.
 */
export const COMPOSED_ROOTS = [
  'btn', 'check', 'tswitch', 'dial', 'fld', 'toast', 'empty', 'st', 'nowtag',
  'skyband', 'nav', 'greet', 'feedhead', 'day', 'ev', 'poster', 'qr', 'board',
  'mt', 'ribbon', 'ribcap', 'exams', 'exam', 'kiosk',
];

/**
 * The roots of the surfaces, which step 4 lays the composed parts out on. The
 * reference page's own container, .wrap, stays behind: the client has a page
 * body of its own and two rules for the same job would fight.
 */
export const SURFACE_ROOTS = ['page', 'rail', 'feedhead'];

/**
 * The reference page frames each of its mockups in a floating slab it calls the
 * mock, and two rules hang off it that the client needs: a secondary or danger
 * button standing on a card fills with the card colour rather than with paper.
 * In the client that situation is a row, not a mockup, so the selector is
 * rewritten to say what it means.
 */
const REFRAMED = new Map([
  ['.mock .btn.secondary.cut::before,.mock .btn.danger.cut::before', '.on-card .btn.secondary.cut::before,.on-card .btn.danger.cut::before'],
  // Revision 4 took the clock's date off the faint grey and onto secondary ink.
  // The client has a greeting and no masthead, so it takes its half of the rule.
  ['.mast .clock .d,.greet .clock .d', '.greet .clock .d'],
]);

const classesIn = selector => [...selector.matchAll(/\.([A-Za-z][\w-]*)/g)].map(match => match[1]);

/**
 * Whether a rule belongs to a set of roots: every comma separated selector in it
 * has to begin with one of them, and every class it names has to be either a
 * root, a state on a root, or something the design system already owns.
 */
function belongsTo(selector, roots) {
  const parts = selector.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => {
    const first = classesIn(part)[0];
    return first !== undefined && roots.includes(first);
  });
}

/**
 * The rules for a set of component roots, in the reference's own order.
 *
 * @param {string} css the reference stylesheet
 * @param {string[]} roots
 * @returns {{ selector: string, text: string }[]}
 */
export function collectRoots(css, roots) {
  return collectFor(css, { roots });
}

/**
 * Every rule the client wants, in the order the reference writes it.
 *
 * The order is the whole point. The reference states a rule and corrects it
 * further down the file, and two rules of equal weight are settled by which
 * comes last, so anything that reorders them changes what the page looks like
 * without changing a single value. One walk over the file keeps the order it
 * has.
 *
 * @param {string} css the reference stylesheet
 * @param {{ selectors?: string[], roots?: string[] }} wanted
 * @returns {{ selector: string, text: string }[]}
 */
export function collectFor(css, { selectors = [], roots = [] } = {}) {
  const named = new Set(selectors);
  return rulesOf(css).flatMap(rule => {
    const reframed = REFRAMED.get(rule.selector);
    if (reframed) {
      return belongsTo(reframed, roots)
        ? [{ selector: reframed, text: rule.text.replace(rule.selector, reframed) }]
        : [];
    }
    const narrowed = NARROWED.get(rule.selector);
    if (narrowed) {
      return named.has(rule.selector)
        ? [{ selector: narrowed, text: rule.text.replace(rule.selector, narrowed) }]
        : [];
    }
    if (named.has(rule.selector)) return [rule];
    if (rule.selector.startsWith('@')) return [];
    return roots.length > 0 && belongsTo(rule.selector, roots) ? [rule] : [];
  });
}

/** The reference stylesheet, as the client reads it. */
export function reference(path = resolve(process.cwd(), '../docs/design/reference/foundation.css')) {
  return readFileSync(path, 'utf8');
}
