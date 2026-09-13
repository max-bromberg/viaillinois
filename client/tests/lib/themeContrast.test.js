import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrast, mix, over, firstStop, stopsOf } from '../support/color.js';

/**
 * Colours a reader can actually read.
 *
 * This began with one report: the dark theme's destructive red was a dark
 * maroon, which is right behind white text on a solid button and unreadable as
 * text on a near black page, and the delete controls on a midterm entry are
 * drawn that second way. It now holds every pair in docs/design/09-accessibility.md,
 * in both themes, so that a token change which breaks one fails the gate rather
 * than reaching a student.
 *
 * Ratios are Web Content Accessibility Guidelines 2.2 contrast ratios. Level AA
 * asks 4.5 to 1 of ordinary text, and 3 to 1 of large text (at least 24 px, or
 * 18.66 px bold) and of graphics.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

/** The tokens of one block, read as they are written. */
function tokensOf(selector) {
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`).exec(CSS);
  expect(block, `expected app.css to hold a ${selector} block`).not.toBeNull();
  const tokens = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const TEXT = 4.5;
const LARGE = 3;

const THEMES = [
  { name: 'the light theme', selector: ':root', lightIsDark: false },
  { name: 'the dark theme', selector: '\\.dark', lightIsDark: true },
];

/** The eight hues, which tags and calendar entries are drawn from. */
const HUES = ['--cat-1', '--cat-2', '--cat-3', '--cat-4', '--cat-5', '--cat-6', '--cat-7', '--cat-8'];

/** The skies, named as the sky component names them. */
const SKIES = ['--sky-morning', '--sky-afternoon', '--sky-evening', '--sky-night'];

describe.each(THEMES)('$name', ({ selector, lightIsDark }) => {
  const t = tokensOf(selector);

  it('reads ink on paper', () => {
    expect(contrast(t['--ink'], t['--paper'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads ink on a card', () => {
    expect(contrast(t['--ink'], t['--card'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads secondary ink on paper', () => {
    expect(contrast(t['--ink-2'], t['--paper'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads muted text on paper', () => {
    expect(contrast(t['--muted'], t['--paper'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads muted text on a card and in a well', () => {
    expect(contrast(t['--muted'], t['--card'])).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(t['--muted'], t['--well'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads the label on the primary button', () => {
    expect(contrast(t['--primary-fg'], t['--primary'])).toBeGreaterThanOrEqual(TEXT);
  });

  /**
   * The primary button is filled with the Current gradient rather than the flat
   * primary token, so its label sits on whichever stop is nearest the corner it
   * is drawn in. The lightest stop is the worst case in the light theme, and it
   * carries a 15 px bold label, which is graphics-sized rather than large text.
   * This pins it where the approved gradient leaves it so that a later change
   * to the gradient cannot quietly take it lower.
   */
  it('reads the label against every stop of the Current gradient', () => {
    const worst = Math.min(...stopsOf(t['--g-current']).map(stop => contrast(t['--primary-fg'], stop)));
    expect(worst).toBeGreaterThanOrEqual(LARGE);
  });

  it('reads primary text on paper and on a card', () => {
    expect(contrast(t['--primary'], t['--paper'])).toBeGreaterThanOrEqual(TEXT - 0.05);
    expect(contrast(t['--primary'], t['--card'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads a soft primary label on its own fill', () => {
    expect(contrast(t['--primary-soft-fg'], t['--primary-soft'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads danger text on paper and on a card', () => {
    expect(contrast(t['--danger'], t['--paper'])).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(t['--danger'], t['--card'])).toBeGreaterThanOrEqual(TEXT);
  });

  it('reads every status word on paper', () => {
    for (const token of ['--ok', '--warn', '--danger', '--plum', '--signal-text']) {
      expect(contrast(t[token], t['--paper']), `${token} on paper`).toBeGreaterThanOrEqual(TEXT - 0.05);
    }
  });

  /**
   * The sky follows the campus hour rather than the theme, so a person on the
   * light theme still gets a dark band at night. Contrast on a band is lowest at
   * its top edge, which is its first stop, and the night sky in the light theme
   * switches the band to light ink.
   */
  it.each(SKIES)('reads the band ink on %s at its top edge', sky => {
    const top = firstStop(t[sky]);
    const bandInk = !lightIsDark && sky === '--sky-night' ? '#e6f0f0' : t['--ink'];
    expect(contrast(bandInk, top)).toBeGreaterThanOrEqual(TEXT);
  });

  it.each(SKIES)('reads the band ink on every stop of %s', sky => {
    const bandInk = !lightIsDark && sky === '--sky-night' ? '#e6f0f0' : t['--ink'];
    // The last stop of every sky is the paper the band fades into, and the page
    // below the band is paper with page ink on it, so the band's own ink is only
    // asked to hold over the stops that are sky.
    const sky_stops = stopsOf(t[sky]).filter(stop => stop.toLowerCase() !== t['--paper'].toLowerCase());
    for (const stop of sky_stops) {
      expect(contrast(bandInk, stop), `${sky} at ${stop}`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  /**
   * The night band is dark in either theme, so it carries the dark palette's
   * inks whatever the page around it is doing. "Happening now" on the kiosk was
   * set in the light theme's deep orange and read at 3.2 to 1 on the night sky
   * before the band was given its own signal colour.
   */
  it('reads the words on a night band, which is dark in either theme', () => {
    const NIGHT_INK = { ink: '#e6f0f0', secondary: '#c3d3d3', muted: '#8fa8a8', signal: '#ff8a66' };
    for (const stop of stopsOf(t['--sky-night']).filter(s => s.toLowerCase() !== t['--paper'].toLowerCase())) {
      for (const [role, colour] of Object.entries(NIGHT_INK)) {
        // The band shows the top of its gradient, so the last stop is the one
        // the page fades into rather than a surface words are set on.
        if (stop === stopsOf(t['--sky-night']).at(-1) && role !== 'ink') continue;
        expect(contrast(colour, stop), `${role} on the night sky at ${stop}`).toBeGreaterThanOrEqual(LARGE);
      }
    }
  });

  it('reads secondary ink on the dusk sky at its top edge', () => {
    expect(contrast(t['--ink-2'], firstStop(t['--sky-evening']))).toBeGreaterThanOrEqual(TEXT);
  });

  /**
   * Tonight's count is set at 30 px in the display face at 800, which is large
   * text, and it is the one orange thing on the band.
   */
  it('reads the count in signal on the dusk sky', () => {
    expect(contrast(t['--signal-text'], firstStop(t['--sky-evening']))).toBeGreaterThanOrEqual(LARGE);
  });

  /**
   * A highlighter is a word over a stroke of its own hue at 30 percent. The
   * stroke is the strictest background the word has, and the word is 62 percent
   * hue mixed into ink.
   *
   * A tag is drawn on a row or on paper. It is never drawn on a well: the one
   * well surface in the agenda is a cancelled row, which carries a status and no
   * tags, and the eight hues do not clear the threshold that far down. See the
   * note in docs/design/09-accessibility.md.
   */
  it.each(HUES)('reads a tag in %s on its own stroke', hue => {
    for (const surface of ['--card', '--paper']) {
      const word = mix(t[hue], 62, t['--ink']);
      const stroke = over(t[hue], 30, t[surface]);
      expect(contrast(word, stroke), `${hue} over ${surface}`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  /**
   * A status is a highlighter too, and a cancelled row puts one on a well, so
   * the status hues are held to every surface a row can have.
   */
  it.each(['--ok', '--warn', '--danger', '--plum', '--signal-text'])(
    'reads a status in %s on its own stroke, on a row, on paper and in a well',
    hue => {
      for (const surface of ['--card', '--paper', '--well']) {
        const word = mix(t[hue], 62, t['--ink']);
        const stroke = over(t[hue], 30, t[surface]);
        expect(contrast(word, stroke), `${hue} over ${surface}`).toBeGreaterThanOrEqual(TEXT);
      }
    },
  );

  it('reads an unselected tag, which is muted text under a dotted hairline', () => {
    expect(contrast(t['--muted'], t['--card'])).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(t['--muted'], t['--paper'])).toBeGreaterThanOrEqual(TEXT);
  });

  /**
   * The time in an event row is the largest thing on it and it sits on the lit
   * end of the lamp, which is the strongest the row's colour ever gets.
   */
  it.each(HUES)('reads the time numerals on a row lit in %s', hue => {
    const lit = over(t[hue], lightIsDark ? 38 : 30, t['--card']);
    expect(contrast(t['--ink'], lit)).toBeGreaterThanOrEqual(TEXT);
  });

  /**
   * The faint grey is for hairlines and hollow pads, never for words, so it is
   * held to the graphics threshold and nothing asks more of it.
   */
  it('draws a hairline that can be seen', () => {
    expect(contrast(t['--line-strong'], t['--card'])).toBeGreaterThanOrEqual(1.3);
    expect(contrast(t['--faint'], t['--card'])).toBeGreaterThanOrEqual(1.8);
  });
});
