import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
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
