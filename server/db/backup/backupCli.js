import { createBackup, verifyBackup } from './index.js';
import { LocalDestination } from './localDestination.js';
import { adminConfigFromEnv } from './config.js';

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const dir = dirIndex === -1 ? null : args[dirIndex + 1];
const retentionIndex = args.indexOf('--retention');
const retention = parseInt(retentionIndex === -1 ? '10' : args[retentionIndex + 1] || '10');

if (!dir) {
  console.error('usage: backupCli.js --dir <directory> [--retention <count>]');
  process.exit(1);
}

const config = adminConfigFromEnv();

try {
  const result = await createBackup({ config, destination: new LocalDestination(dir, retention) });
  await verifyBackup({ path: result.path, expectedTables: result.tables, config });
  // Only the path goes to stdout. The cutover script captures it.
  process.stdout.write(result.path);
  process.exit(0);
} catch (err) {
  console.error(`backup failed: ${err.message}`);
  process.exit(1);
}
