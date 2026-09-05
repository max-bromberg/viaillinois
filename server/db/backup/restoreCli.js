import { restoreBackup } from './restore.js';
import { adminConfigFromEnv, databaseArgument } from './config.js';

const args = process.argv.slice(2);
const database = databaseArgument(args);
// The dump path is the one argument that is not a flag or the value of one.
const flagIndex = args.indexOf('--database');
const path = args.filter((_, i) => i !== flagIndex && i !== flagIndex + 1)[0];

if (!path) {
  console.error('usage: restoreCli.js <dump-path> [--database <name>]');
  process.exit(1);
}

const config = adminConfigFromEnv({ database });

try {
  await restoreBackup({ path, config });
  process.exit(0);
} catch (err) {
  console.error(`restore failed: ${err.message}`);
  process.exit(1);
}
