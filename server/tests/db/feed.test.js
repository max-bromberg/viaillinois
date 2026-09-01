import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const fixture = fileURLToPath(new URL('../fixtures/feedDumpClient.mjs', import.meta.url));

/**
 * Feed a dump to a stand in for the mysql client, in a process of its own, and
 * report what that process printed and how it ended. The real client behaves
 * the way these scripts do: it reads part of its input, rejects a statement,
 * and exits while the writer is still going.
 */
async function feedInChildProcess(script, path) {
  try {
    const { stdout } = await execFileAsync('node', [fixture, path, script]);
    return { crashed: false, output: stdout.trim() };
  } catch (err) {
    return { crashed: true, output: `${err.stdout}${err.stderr}` };
  }
}

describe('feedDump', () => {
  let dir;
  let dump;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'via-feed-'));
    dump = join(dir, 'dump.sql');
    // Larger than a pipe buffer, so the writer is still going when the client
    // stops reading. A dump that fits in the buffer never exposes the problem.
    await writeFile(dump, 'x'.repeat(2_000_000));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports the exit code when the client stops reading partway through', async () => {
    const result = await feedInChildProcess('head -c 100 >/dev/null; exit 1', dump);
    expect(result.crashed).toBe(false);
    expect(result.output).toBe('rejected: restore exited 1');
  });

  it('resolves when the client consumes the whole dump', async () => {
    const result = await feedInChildProcess('cat >/dev/null', dump);
    expect(result.crashed).toBe(false);
    expect(result.output).toBe('resolved');
  });

  it('reports a failure to read the dump', async () => {
    const result = await feedInChildProcess('cat >/dev/null', join(dir, 'missing.sql'));
    expect(result.crashed).toBe(false);
    expect(result.output).toMatch(/rejected: ENOENT/);
  });
});
