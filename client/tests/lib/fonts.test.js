import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { characterMap, variationAxes } from '../support/woff2.js';

/**
 * The typefaces the site ships, opened and read.
 *
 * Revisions 1 through 3 of the design were reviewed on font files that held
 * almost none of the alphabet. The page fell back to a system font for every
 * letter except the a, and three rounds of review went by before anybody
 * noticed, because a file with the right name in the right place looks like a
 * working font from everywhere except inside it. Nothing about a font file is
 * trusted here that has not been read out of the file.
 */
const PUBLIC = resolve(process.cwd(), 'public/fonts');
const CSS = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

const FACES = [
  { file: 'BricolageGrotesque-latin.woff2', family: 'Bricolage Grotesque' },
  { file: 'IBMPlexSans-latin.woff2', family: 'IBM Plex Sans' },
  { file: 'IBMPlexMono-400-latin.woff2', family: 'IBM Plex Mono' },
  { file: 'IBMPlexMono-500-latin.woff2', family: 'IBM Plex Mono' },
];

/** Printable ASCII, which is every character the interface sets in these faces. */
const FIRST = 0x20;
const LAST = 0x7e;

describe.each(FACES)('$file', ({ file, family }) => {
  const path = resolve(PUBLIC, file);

  it('is shipped with the client', () => {
    expect(existsSync(path), `expected ${file} under client/public/fonts`).toBe(true);
  });

  it('covers U+0020 through U+007E', () => {
    const characters = characterMap(path);
    const missing = [];
    for (let code = FIRST; code <= LAST; code += 1) {
      if (!characters.has(code)) missing.push(String.fromCharCode(code));
    }
    expect(missing, `${file} has no glyph for ${JSON.stringify(missing.join(''))}`).toEqual([]);
  });

  it('is declared in app.css under its own family, at its own path', () => {
    const declaration = new RegExp(
      `@font-face\\s*\\{[^}]*?font-family:\\s*["']${family}["'][^}]*?${file.replace('.', '\\.')}[^}]*?\\}`,
    );
    expect(declaration.test(CSS.replace(/\s+/g, ' ')), `expected an @font-face for ${file}`).toBe(true);
  });
});

describe('Bricolage Grotesque', () => {
  /**
   * The whole look rests on one family pushed to its extremes: condensed 800
   * for anything read from across a room, wide 300 for the sentence beside it,
   * condensed 200 for clocks. A file without these axes would render every one
   * of those at the same width and weight and nothing would look wrong enough
   * to notice.
   */
  it.each([
    ['wdth', 75, 100],
    ['wght', 200, 800],
    ['opsz', 12, 96],
  ])('carries the %s axis from %i to %i', (tag, minimum, maximum) => {
    const axis = variationAxes(resolve(PUBLIC, 'BricolageGrotesque-latin.woff2')).get(tag);
    expect(axis, `expected a ${tag} axis`).toBeDefined();
    expect(axis.minimum).toBeLessThanOrEqual(minimum);
    expect(axis.maximum).toBeGreaterThanOrEqual(maximum);
  });
});

describe('the shipped files', () => {
  it('are the ones the design system approved', () => {
    const approved = resolve(process.cwd(), '../docs/design/fonts');
    for (const { file } of FACES) {
      expect(
        readFileSync(resolve(PUBLIC, file)).equals(readFileSync(resolve(approved, file))),
        `${file} differs from the approved file in docs/design/fonts`,
      ).toBe(true);
    }
  });
});
