import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Native form controls do not follow the theme on their own.
 *
 * A select with no background of its own is painted by the browser, which
 * paints it white, so on the dark theme it is a white box sitting in the middle
 * of a dark page. That is what the Availability tab of the admin page looked
 * like, and it is a mistake anybody can make again in the next select they
 * write, so it is checked over the whole client rather than in the one place it
 * was reported.
 */
const ROOT = resolve(process.cwd(), 'src');

function svelteFiles(dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return svelteFiles(path);
    return path.endsWith('.svelte') ? [path] : [];
  });
}

/** Every select tag in the client, with the file it is in. */
function selects() {
  return svelteFiles(ROOT).flatMap(path => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/<select\b[\s\S]*?>/g)].map(match => ({
      where: `${relative(ROOT, path)}: ${match[0].replace(/\s+/g, ' ').slice(0, 80)}`,
      tag: match[0],
    }));
  });
}

describe('native selects', () => {
  it('are painted by the theme rather than by the browser', () => {
    const unpainted = selects()
      .filter(({ tag }) => !/bg-background|bg-card|bg-muted|bg-input/.test(tag))
      .map(({ where }) => where);
    expect(unpainted).toEqual([]);
  });

  it('finds the selects it is meant to be checking', () => {
    expect(selects().length).toBeGreaterThan(5);
  });
});
