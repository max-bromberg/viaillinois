import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The tokens in the client are the tokens in the approved reference stylesheet.
 *
 * docs/design/11-implementation.md makes reference/foundation.css normative: every
 * value in the client comes from it, and where a written document and the
 * stylesheet disagree the stylesheet wins. A value copied by hand drifts the
 * first time either side is edited, so the two are compared here instead of
 * being trusted to stay equal.
 */
const APP = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');
const REFERENCE = readFileSync(resolve(process.cwd(), '../docs/design/reference/foundation.css'), 'utf8');

/** The custom properties declared in the first block a selector opens. */
function tokensOf(css, selector) {
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n?\\s*\\}`).exec(css);
  expect(block, `expected a ${selector} block`).not.toBeNull();
  const tokens = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+):\s*([^;]+);?/g)) {
    // Whitespace inside a gradient is not a difference anybody can see.
    tokens[name] = value.trim().replace(/\s+/g, ' ');
  }
  return tokens;
}

/**
 * The names the design system owns. The client keeps the old shadcn names
 * beside them for one step so that screens which have not been converted yet
 * keep working, and those are not expected to appear in the reference.
 */
const SYSTEM = /^--(paper|card|well|line|line-strong|ink|ink-2|muted|faint|primary|primary-fg|primary-soft|primary-soft-fg|signal|signal-text|signal-soft|ok|warn|danger|plum|cat-\d|sky-\w+|sky-ink|g-current|g-board|lamp|shadow-float|sans|display|mono|tagmix)$/;

describe('the light theme', () => {
  const mine = tokensOf(APP, ':root');
  const theirs = tokensOf(REFERENCE, ':root');

  it.each(Object.keys(tokensOf(REFERENCE, ':root')))('carries %s exactly as the reference declares it', name => {
    expect(mine[name], `${name} is missing from app.css`).toBeDefined();
    expect(mine[name]).toBe(theirs[name]);
  });

  it('adds no design token of its own invention', () => {
    const invented = Object.keys(mine).filter(name => SYSTEM.test(name) && !(name in theirs));
    expect(invented).toEqual([]);
  });
});

describe('the dark theme', () => {
  const theirs = tokensOf(REFERENCE, ':root\\[data-theme="dark"\\]');

  /**
   * The client toggles a class on the document element and has since before
   * this design, and an inline script in index.html adds it before first paint.
   * The class is mapped to the same values as the reference's attribute block
   * rather than the mechanism being changed underneath a working page.
   */
  it.each(Object.keys(tokensOf(REFERENCE, ':root\\[data-theme="dark"\\]')))(
    'carries %s on the dark class exactly as the reference declares it',
    name => {
      const mine = tokensOf(APP, '\\.dark');
      expect(mine[name], `${name} is missing from the .dark block`).toBeDefined();
      expect(mine[name]).toBe(theirs[name]);
    },
  );

  it('answers to the attribute the reference uses as well as to the class', () => {
    expect(APP).toMatch(/\[data-theme="dark"\]/);
  });

  /**
   * The reference darkens on the system preference too. That block has to stand
   * aside for somebody who asked for the light theme on a system set to dark,
   * or their choice is overruled by their operating system.
   */
  it('lets an explicit light choice win over the system preference', () => {
    const guarded = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/;
    expect(guarded.test(APP.replace(/\s+/g, ' ').replace(/ \{/g, '{').replace(/\{/g, ' {'))
      || /:root:not\(\[data-theme="light"\]\)/.test(APP)).toBe(true);
  });
});

describe('the typefaces', () => {
  it('declares the three families the reference declares', () => {
    const theirs = tokensOf(REFERENCE, ':root');
    const mine = tokensOf(APP, ':root');
    for (const name of ['--sans', '--display', '--mono']) {
      expect(mine[name]).toBe(theirs[name]);
    }
  });
});
