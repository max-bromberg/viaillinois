import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const renameSpy = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, rename: (...args) => renameSpy(...args) };
});

const { LocalDestination } = await import('../../db/backup/localDestination.js');

let dir;
let source;

beforeEach(async () => {
  renameSpy.mockReset();
  dir = await mkdtemp(join(tmpdir(), 'via-dest-'));
  source = await mkdtemp(join(tmpdir(), 'via-src-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  await rm(source, { recursive: true, force: true });
});

describe('local backup destination', () => {
  it('moves the dump into place', async () => {
    const actual = await vi.importActual('node:fs/promises');
    renameSpy.mockImplementation(actual.rename);
    const tmpPath = join(source, 'dump.sql');
    await writeFile(tmpPath, 'CREATE TABLE Widgets (id INT);\n');

    const path = await new LocalDestination(dir, 10).store(tmpPath, 'dump.sql');

    expect(await readFile(path, 'utf8')).toContain('CREATE TABLE Widgets');
    expect(await readdir(source)).toEqual([]);
  });

  /**
   * The dump is written to a private temporary directory and the backup
   * directory is a bind mount, so the two are routinely on different
   * filesystems and rename fails with EXDEV. A backup that cannot be stored is
   * a failed deploy, and this is the ordinary case rather than an edge one.
   */
  /**
   * Two databases are dumped into one directory now, the web platform's and
   * the Discord bot's, and the cutover takes both on every deploy. Retention
   * counted across the directory would mean each database kept half as much
   * history as the setting says, and a run of bot deploys would age out the
   * web platform's dumps.
   */
  describe('retention with two databases in one directory', () => {
    async function place(name, minutesAgo) {
      const path = join(dir, name);
      await writeFile(path, 'dump');
      const when = new Date(Date.now() - minutesAgo * 60_000);
      await utimes(path, when, when);
      return path;
    }

    it('counts only the dumps of the database it was given', async () => {
      await place('via-1.sql', 40);
      await place('via-2.sql', 30);
      await place('via_bot-1.sql', 20);
      await place('via_bot-2.sql', 10);
      await place('via_bot-3.sql', 1);

      await new LocalDestination(dir, 2, 'via_bot').prune();

      expect((await readdir(dir)).sort()).toEqual([
        'via-1.sql',
        'via-2.sql',
        'via_bot-2.sql',
        'via_bot-3.sql',
      ]);
    });

    it('lists only the dumps of that database, newest first', async () => {
      await place('via-1.sql', 40);
      await place('via_bot-1.sql', 20);
      await place('via_bot-2.sql', 10);

      const listed = await new LocalDestination(dir, 10, 'via_bot').list();

      expect(listed.map((path) => path.split('/').pop())).toEqual([
        'via_bot-2.sql',
        'via_bot-1.sql',
      ]);
    });

    it('counts everything when it was given no database, as it always has', async () => {
      await place('via-1.sql', 40);
      await place('via_bot-1.sql', 10);

      expect(await new LocalDestination(dir, 10).list()).toHaveLength(2);
    });
  });

  it('falls back to a copy when the destination is on another filesystem', async () => {
    const crossDevice = Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' });
    renameSpy.mockRejectedValue(crossDevice);
    const tmpPath = join(source, 'dump.sql');
    await writeFile(tmpPath, 'CREATE TABLE Widgets (id INT);\n');

    const path = await new LocalDestination(dir, 10).store(tmpPath, 'dump.sql');

    expect(await readFile(path, 'utf8')).toContain('CREATE TABLE Widgets');
    expect(await readdir(source)).toEqual([]);
  });
});
