import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * VIA does not show how many people a room holds.
 *
 * The number in the locations table is not a figure anybody measured. It reads
 * 30 for very nearly every room on campus, so a board comparing two rooms by it
 * learns nothing, and a board that believed it would plan around a number VIA
 * cannot stand behind. The column stays where it is, because the timetable
 * import writes it, and nothing a person reads is drawn from it.
 *
 * This walks the client rather than naming the five places the number used to
 * appear, so that a sixth cannot arrive without this failing.
 */
const SOURCE = resolve(process.cwd(), 'src');

function sourceFiles(directory = SOURCE) {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(svelte|js)$/.test(path) ? [path] : [];
  });
}

describe('the capacity of a room', () => {
  it('is drawn on no screen in the client', () => {
    const showing = sourceFiles()
      .map(path => ({ path: relative(SOURCE, path), text: readFileSync(path, 'utf8') }))
      .filter(file => /max_capacity|maxCapacity/.test(file.text))
      .map(file => file.path);

    expect(showing).toEqual([]);
  });
});
