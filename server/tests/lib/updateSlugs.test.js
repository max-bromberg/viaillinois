import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readUpdateSlugs, isUpdateSlug, UPDATES_DIRECTORY } from '../../lib/seo/updateSlugs.js';

/**
 * Which platform updates were actually written.
 *
 * The client has always known, because it gathers the markdown at build time.
 * The server did not, and it was telling search engines that any address of
 * the shape /updates/anything was a real page worth keeping, with a canonical
 * address pointing at itself. What is held here is that the server reads the
 * same filenames the client does, and that a directory it cannot read leaves
 * it recognising nothing rather than throwing on the way up.
 */
describe('the updates that were written', () => {
  const withFiles = names => {
    const directory = mkdtempSync(join(tmpdir(), 'via-updates-'));
    for (const name of names) writeFileSync(join(directory, name), '---\ntitle: One\n---\n');
    return directory;
  };

  it('is the filename of each markdown file, without the extension', () => {
    const directory = withFiles(['2026-04-23-welcome.md', '2026-09-01-the-designer.md']);
    expect(readUpdateSlugs(directory)).toEqual(
      new Set(['2026-04-23-welcome', '2026-09-01-the-designer']),
    );
  });

  it('leaves out anything that is not markdown', () => {
    const directory = withFiles(['real.md', 'notes.txt', 'picture.png']);
    expect(readUpdateSlugs(directory)).toEqual(new Set(['real']));
  });

  /**
   * The safe direction. An update whose address is not recognised is served
   * the ordinary fallback, which asks not to be indexed, and the client draws
   * the page either way. Recognising everything is the mistake worth avoiding.
   */
  it('recognises nothing where the directory is not there to read', () => {
    expect(readUpdateSlugs(join(tmpdir(), 'via-updates-that-do-not-exist'))).toEqual(new Set());
  });

  it('is empty rather than throwing where the path is not a directory at all', () => {
    const directory = withFiles(['real.md']);
    expect(() => readUpdateSlugs(join(directory, 'real.md'))).not.toThrow();
  });

  /**
   * The path the server resolves has to be the directory the updates are
   * really in, in the repository and in the image alike. Dockerfile.server
   * copies it in for that reason, so a wrong path here is a production only
   * fault that no other test would catch.
   */
  it('reads the directory the updates are really written in', () => {
    expect(existsSync(UPDATES_DIRECTORY)).toBe(true);
    expect(readUpdateSlugs().size).toBeGreaterThan(0);
    expect(isUpdateSlug('2026-04-23-welcome')).toBe(true);
    expect(isUpdateSlug('nothing-was-ever-written-here')).toBe(false);
  });
});
