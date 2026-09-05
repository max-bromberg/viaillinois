import { rename, readdir, stat, mkdir, unlink, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

/** On-box backup destination. Stores dumps in a directory outside the Docker volume. */
export class LocalDestination {
  /**
   * @param {string} dir directory to store dumps in
   * @param {number} retentionCount how many dumps of this database to keep
   * @param {string | null} database the database whose dumps this counts, or
   *   null to count every dump in the directory. The stack keeps two databases
   *   on one server, the web platform's and the Discord bot's, and the cutover
   *   dumps both into the same directory on every deploy. Counted across the
   *   directory, each would keep half the history the retention count names,
   *   and a run of deploys of one would age out the dumps of the other.
   */
  constructor(dir, retentionCount = 10, database = null) {
    this.dir = dir;
    this.retentionCount = retentionCount;
    // createBackup names a dump after the database it came from, then the
    // moment it was taken.
    this.prefix = database ? `${database}-` : null;
  }

  async store(tmpPath, name) {
    await mkdir(this.dir, { recursive: true });
    const finalPath = join(this.dir, name);
    try {
      await rename(tmpPath, finalPath);
    } catch (err) {
      // The dump is written to a private temporary directory and the backup
      // directory is usually a bind mount, so the two sit on different
      // filesystems and rename cannot cross that boundary.
      if (err.code !== 'EXDEV') throw err;
      await copyFile(tmpPath, finalPath);
      await unlink(tmpPath);
    }
    await this.prune();
    return finalPath;
  }

  async list() {
    let names;
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const dumps = names.filter(
      n => n.endsWith('.sql') && (this.prefix === null || n.startsWith(this.prefix))
    );
    const withTimes = await Promise.all(
      dumps.map(async n => {
        const path = join(this.dir, n);
        const s = await stat(path);
        return { path, mtime: s.mtimeMs };
      })
    );
    return withTimes.sort((a, b) => b.mtime - a.mtime).map(d => d.path);
  }

  async prune() {
    const all = await this.list();
    for (const path of all.slice(this.retentionCount)) {
      await unlink(path);
    }
  }
}
