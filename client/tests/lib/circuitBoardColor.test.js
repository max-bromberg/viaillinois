import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The board takes its colours from the design system's tokens.
 *
 * Step 1 renamed the stock component kit's properties out of the way, because
 * three of their names collided with the design system's own. This file went on
 * reading --foreground, which no longer exists, so the board fell back to a hard
 * coded near black and went invisible on the kiosk's night sky. Nothing here
 * reads a token that is not in the token file.
 */
const SOURCE = readFileSync(resolve(process.cwd(), 'src/lib/CircuitBackground.svelte'), 'utf8');
const CSS = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

describe('the circuit board', () => {
  it('reads only custom properties the token file declares', () => {
    const read = [...SOURCE.matchAll(/getPropertyValue\(\s*['"](--[\w-]+)['"]/g)].map(match => match[1]);
    expect(read.length, 'the board reads no token at all').toBeGreaterThan(0);
    for (const token of read) {
      expect(CSS.includes(`${token}:`), `${token} is not declared in app.css`).toBe(true);
    }
  });

  it('draws its traces in the page ink rather than in a colour of its own', () => {
    expect(SOURCE).toContain("--ink");
  });

  it('spends its one accent on the signal colour, which is what carries current', () => {
    expect(SOURCE).toMatch(/--signal/);
  });
});
