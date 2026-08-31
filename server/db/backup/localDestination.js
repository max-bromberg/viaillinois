import { rename, readdir, stat, mkdir, unlink, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

/** On-box backup destination. Stores dumps in a directory outside the Docker volume. */
export class LocalDestination {
  /**
   * @param {string} dir directory to store dumps in
   * @param {number} retentionCount how many dumps to keep
   */
  constructor(dir, retentionCount = 10) {
    this.dir = dir;
    this.retentionCount = retentionCount;
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
    const dumps = names.filter(n => n.endsWith('.sql'));
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
