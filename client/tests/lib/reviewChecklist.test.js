import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * The review checklist, over the whole client.
 *
 * docs/design/11-implementation.md ends with a list a pull request is checked
 * against before review. Most of it is a matter of judgement, but the items
 * below are the ones that were habits rather than decisions: a rounded rectangle
 * with a one pixel border reached for as the default container, a shadow under
 * something that does not float, an uppercase caption above a heading, an emoji
 * where an icon belongs, a colour typed in to make one screen look right. Each
 * of those is how the design this replaced drifted into looking generated, and
 * each comes back one file at a time unless something is watching.
 */
const ROOT = resolve(process.cwd(), 'src');

function svelteFiles(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return path.endsWith('.svelte') ? [path] : [];
  });
}

const files = svelteFiles(ROOT).map(path => ({ where: relative(ROOT, path), source: readFileSync(path, 'utf8') }));

/** Every place a pattern appears, as "file: what was found". */
function found(pattern, keep = () => true) {
  return files.flatMap(({ where, source }) =>
    [...source.matchAll(pattern)]
      .map(match => match[0])
      .filter(keep)
      .map(hit => `${where}: ${hit.replace(/\s+/g, ' ').slice(0, 80)}`),
  );
}

describe('the review checklist', () => {
  it('finds the files it is meant to be checking', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  /**
   * Colours live in the token file. The two exceptions are named: the palette a
   * poster is drawn onto a canvas with, which a test holds against the tokens,
   * and the black an organization's colour picker starts on, which is data
   * rather than a drawn colour and which the adaptation reads as a grey.
   */
  it('has no raw hex value outside the token file', () => {
    const ALLOWED = new Set([
      // A band that is dark in both themes cannot take an ink that moves with
      // the theme; see docs/design/03-the-look.md on the mark, and the sky.
      '#e6f0f0', '#c3d3d3', '#8fa8a8', '#5f7879', '#8fdfe1', '#ffffff', '#fff',
      // The value an organization's colour picker starts on.
      '#000000',
      // The code in Qr, which a camera reads rather than an eye. It has to be
      // dark modules on a light field in both themes, so it cannot take a
      // colour that inverts: drawn from the tokens, the dark reading would be
      // light on dark and no reader could resolve it. This is the light
      // palette's ink, fixed.
      '#0b1a1b',
    ]);
    expect(found(/#[0-9a-fA-F]{3,8}\b/g, hit => !ALLOWED.has(hit.toLowerCase()))).toEqual([]);
  });

  /**
   * One exception, and it is deliberate rather than an oversight: the heart in
   * the footer's sign off, which was asked for by name. It is hidden from
   * assistive technology with the word beside it, so it decorates the sentence
   * without being read out as one. Everywhere else a shape is an Icon, because
   * emoji draw differently on every platform and the lobby screen and a phone
   * would not be showing the same site.
   */
  const DECORATIVE = new Set(['lib/Footer.svelte: \u2764']);

  it('has no emoji standing in for an icon', () => {
    const hits = found(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu);
    expect(hits.filter(hit => !DECORATIVE.has(hit))).toEqual([]);
  });

  it('has no rounded rectangle with a one pixel border used as a container', () => {
    expect(found(/class="[^"]*\brounded-(?:sm|md|lg|xl|2xl|full)\b[^"]*\bborder\b[^"]*"/g)).toEqual([]);
  });

  it('has no shadow on anything that does not float', () => {
    // The floating level is the only one that casts a shadow, and it is drawn
    // from the --shadow-float token rather than from a utility class.
    expect(found(/class="[^"]*\bshadow-(?:sm|md|lg|xl|2xl)\b[^"]*"/g)).toEqual([]);
  });

  it('has no eyebrow label above a heading', () => {
    expect(found(/class="[^"]*\buppercase\b[^"]*\btracking-(?:wide|wider|widest)\b[^"]*"/g)).toEqual([]);
  });

  /**
   * The stock component kit's colour names went with the kit. A class that names
   * one is a screen that was never converted, or one that has drifted back.
   */
  it('names no colour from the stock component kit', () => {
    const STOCK = /\b(?:bg-card|bg-background|bg-muted|bg-accent|bg-secondary|bg-popover|bg-destructive|text-muted-foreground|text-foreground|text-card-foreground|text-accent-foreground|text-secondary-foreground|text-destructive|text-primary-foreground|bg-primary|border-input|border-border)\b/g;
    expect(found(STOCK)).toEqual([]);
  });

  it('sets nothing below 12 px', () => {
    const small = found(/font-size:\s*(\d+(?:\.\d+)?)px/g, hit => {
      const size = Number(/(\d+(?:\.\d+)?)/.exec(hit)[1]);
      return size < 12;
    });
    expect(small).toEqual([]);
  });

  /**
   * The condensed cut is tight by design. Negative tracking on it is the one
   * typographic habit the design documents call out by name.
   */
  it('puts no negative tracking on the display face', () => {
    expect(found(/letter-spacing:\s*-[\d.]+em/g)).toEqual([]);
  });
});
