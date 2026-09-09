import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Colours a reader can actually read.
 *
 * The dark theme's destructive red was a dark maroon, which is right behind
 * white text on a solid button and unreadable as text on a near black page. The
 * delete controls on a midterm entry are drawn that second way, as an outline
 * and a label, and boards reported that they could not see them. This pins the
 * pairs that a change to the palette would quietly break, at the contrast the
 * Web Content Accessibility Guidelines ask of ordinary text.
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

/** An "H S% L%" token as red, green and blue between zero and one. */
function rgbOf(token) {
  const [h, s, l] = token.replace(/%/g, '').split(/\s+/).map(Number);
  const saturation = s / 100;
  const lightness = l / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = n => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)];
}

const luminance = rgb => {
  const [r, g, b] = rgb.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a, b) {
  const [high, low] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const READABLE = 4.5;

describe.each([[':root'], ['.dark']])('%s', selector => {
  const tokens = tokensOf(selector);

  it('reads a destructive label against the page it sits on', () => {
    expect(contrast(tokens['--destructive'], tokens['--background'])).toBeGreaterThanOrEqual(READABLE);
  });

  it('reads a destructive label against a card', () => {
    expect(contrast(tokens['--destructive'], tokens['--card'])).toBeGreaterThanOrEqual(READABLE);
  });

  it('reads the label on a solid destructive button', () => {
    expect(contrast(tokens['--destructive-foreground'], tokens['--destructive'])).toBeGreaterThanOrEqual(READABLE);
  });
});
