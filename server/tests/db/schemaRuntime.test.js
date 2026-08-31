import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const serverRoot = new URL('../..', import.meta.url).pathname;

/**
 * Vitest transpiles TypeScript with esbuild, which is more forgiving than the
 * type stripping the server actually runs under. These modules have to import
 * cleanly the same way production imports them, so the check runs a real node
 * process rather than trusting the test transform.
 */
describe('schema modules under node type stripping', () => {
  for (const module of ['./db/schema/schema.ts', './db/schema/relations.ts', './db/client.ts']) {
    it(`imports ${module} the way the server does`, async () => {
      const { stdout } = await run(
        process.execPath,
        ['--experimental-strip-types', '-e', `import(${JSON.stringify(module)}).then(() => console.log('ok'))`],
        { cwd: serverRoot }
      );
      expect(stdout.trim()).toBe('ok');
    }, 30_000);
  }
});
