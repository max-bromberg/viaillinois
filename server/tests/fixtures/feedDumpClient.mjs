/**
 * Runs one feedDump call in a process of its own.
 *
 * The scenario under test is a stream error with no listener, and that kills
 * the process rather than failing an assertion. A test runner installs its own
 * uncaught exception handler and so hides exactly the failure being measured,
 * which is why this runs standalone and reports through its exit code.
 *
 * Usage: node feedDumpClient.mjs <dump-path> <client-shell-script>
 */
import { execFile } from 'node:child_process';
import { feedDump } from '../../db/backup/feed.js';

const [path, script] = process.argv.slice(2);

try {
  await new Promise((resolve, reject) => {
    const child = execFile('sh', ['-c', script]);
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`restore exited ${code}`));
    });
    feedDump(child, path, reject);
  });
  console.log('resolved');
} catch (err) {
  console.log(`rejected: ${err.message}`);
}
