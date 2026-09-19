import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * How wide the page is allowed to be.
 *
 * The band, the page and the footer each have to line up down their left and
 * right edges, so they each have to stop at the same place. Each one carried
 * its own copy of the number, which is three chances for them to disagree the
 * first time anybody changes one, and it is the reason the width could not be
 * adjusted without hunting for every copy.
 *
 * The reference stylesheet already names this measurement. It is a token now,
 * read by everything that has to line up with everything else.
 */
const read = file => readFileSync(resolve(process.cwd(), file), 'utf8');

const WRAPPERS = [
  ['src/App.svelte', '.shell'],
  ['src/lib/AppSkeleton.svelte', null],
  ['src/lib/Footer.svelte', '.inner'],
];

describe('the width of the page', () => {
  it('is named once, in the stylesheet, rather than in each surface', () => {
    expect(read('src/app.css')).toMatch(/--wrap:\s*\d+px/);
  });

  it('is read from that one name by every surface that has to line up', () => {
    for (const [file] of WRAPPERS) {
      const source = read(file);
      expect(source, `${file} still writes a width of its own`).not.toMatch(/max-width:\s*1180px/);
      expect(source, `${file} does not read the shared width`).toContain('max-width: var(--wrap)');
    }
  });

  it('uses more of the screen than it did', () => {
    const [, value] = read('src/app.css').match(/--wrap:\s*(\d+)px/);
    expect(Number(value)).toBeGreaterThan(1180);
  });
});
