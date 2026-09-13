import { restoreBackup } from './restore.js';
import { adminConfigFromEnv, databaseArgument } from './config.js';

const args = process.argv.slice(2);
const database = databaseArgument(args);

/**
 * The dump path is the one argument that is neither a flag nor the value of
 * one. Written as a filter over the indices rather than as a search for the
 * first argument that does not begin with two dashes, because a dump path
 * could in principle begin with anything, and written against a flag index of
 * null rather than the minus one that indexOf answers with, because minus one
 * plus one is zero and the path is usually argument zero.
 */
const flagIndex = args.indexOf('--database');
const path = args
  .filter((_value, index) => flagIndex === -1 || (index !== flagIndex && index !== flagIndex + 1))
  .find(value => !value.startsWith('--'));

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
