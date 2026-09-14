import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * What the shell says about itself before any page is rendered.
 *
 * Three things were wrong at once, and together they are why a shared VIA link
 * looked like nothing. There was no picture named anywhere, so most readers
 * showed none. The card was declared small, so even with a picture it would
 * have been a thumbnail beside the text rather than the banner that gets a link
 * opened. And the colour a phone paints its browser bar with was the
 * university's blue, which is a colour VIA's design does not contain.
 */
const shell = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('the shell', () => {
  it('names a picture, so a link shared anywhere has one', () => {
    expect(shell).toMatch(/property="og:image" content="[^"]+\.png"/);
    expect(shell).toMatch(/name="twitter:image"/);
  });

  it('declares the picture at the size every reader crops to', () => {
    expect(shell).toContain('property="og:image:width" content="1200"');
    expect(shell).toContain('property="og:image:height" content="630"');
  });

  it('asks for the large card, which is the one that gets a link opened', () => {
    expect(shell).toContain('name="twitter:card" content="summary_large_image"');
    expect(shell).not.toContain('name="twitter:card" content="summary"');
  });

  it('paints the browser bar in a colour the design contains', () => {
    const [, colour] = shell.match(/name="theme-color" content="(#[0-9a-fA-F]{6})"/) ?? [];
    expect(colour).toBeTruthy();
    // The university's blue is not one of VIA's surfaces.
    expect(colour.toLowerCase()).not.toBe('#13294b');
    const app = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');
    expect(app.toLowerCase()).toContain(colour.toLowerCase());
  });

  it('says what the picture shows, for anybody who cannot see it', () => {
    expect(shell).toMatch(/property="og:image:alt" content="[^"]{20,}"/);
  });
});
