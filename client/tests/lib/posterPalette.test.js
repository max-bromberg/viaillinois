import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIGHT, DARK, DEFAULT_ACCENT, SIGNAL, paletteOn, isDark } from '../../src/lib/posterPalette.js';

/**
 * A poster is drawn onto a canvas and downloaded as an image, so it is the one
 * surface that cannot take its colours from the stylesheet: a canvas needs a
 * value. That makes it the one place a colour can drift away from the site it
 * advertises without anything on screen looking wrong, which is why every value
 * is held here against the token it claims to be.
 */
const CSS = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

/** The value a token has in one of the theme blocks. */
function tokenIn(selector, name) {
  const block = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`).exec(CSS);
  expect(block, `expected a ${selector} block`).not.toBeNull();
  const found = new RegExp(`${name}:\\s*([^;]+);`).exec(block[1]);
  expect(found, `expected ${name} in ${selector}`).not.toBeNull();
  return found[1].trim();
}

describe('the poster palette', () => {
  it.each([
    ['ground', '--paper'],
    ['ink', '--ink'],
    ['muted', '--muted'],
    ['line', '--line'],
    ['onAccent', '--primary-fg'],
  ])('draws %s in the light theme with %s', (role, token) => {
    expect(LIGHT[role]).toBe(tokenIn(':root', token));
  });

  it.each([
    ['ground', '--paper'],
    ['ink', '--ink'],
    ['muted', '--muted'],
    ['line', '--line'],
    ['onAccent', '--primary-fg'],
  ])('draws %s in the dark theme with %s', (role, token) => {
    expect(DARK[role]).toBe(tokenIn('\\.dark', token));
  });

  it('falls back to the primary colour when an organization has chosen none', () => {
    expect(DEFAULT_ACCENT).toBe(tokenIn(':root', '--primary'));
  });

  it('carries the signal colour, which the circuit board spends on a live pad', () => {
    expect(SIGNAL).toBe(tokenIn(':root', '--signal'));
  });
});

describe('reading against a ground', () => {
  it('takes the light palette on a light ground and the dark palette on a dark one', () => {
    expect(paletteOn('#f5fafa')).toBe(LIGHT);
    expect(paletteOn('#0a1516')).toBe(DARK);
  });

  it.each([
    ['#000000', true], ['#0a1516', true], ['#0b5fa5', true], ['#6b3fa0', true],
    ['#ffffff', false], ['#f5fafa', false], ['#ffff00', false], ['#b7c85a', false],
  ])('reads %s as dark: %s', (colour, dark) => {
    expect(isDark(colour)).toBe(dark);
  });

  it('does not call an unreadable value dark, which would put light text on nothing', () => {
    expect(isDark(null)).toBe(false);
    expect(isDark('teal')).toBe(false);
  });
});
