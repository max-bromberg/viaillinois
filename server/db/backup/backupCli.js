import { createBackup, verifyBackup } from './index.js';
import { LocalDestination } from './localDestination.js';
import { adminConfigFromEnv, databaseArgument } from './config.js';

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const dir = dirIndex === -1 ? null : args[dirIndex + 1];
const retentionIndex = args.indexOf('--retention');
const retention = parseInt(retentionIndex === -1 ? '10' : args[retentionIndex + 1] || '10');

if (!dir) {
  console.error('usage: backupCli.js --dir <directory> [--retention <count>] [--database <name>]');
  process.exit(1);
}

// Named, this backs up the database named. Unnamed, it backs up the one the
// environment points at, which is how every existing caller uses it.
const config = adminConfigFromEnv({ database: databaseArgument(args) });

try {
  const result = await createBackup({
    config,
    // Retention is per database, so a deploy that dumps two of them into one
    // directory keeps the full history of each.
    destination: new LocalDestination(dir, retention, config.database),
  });
  await verifyBackup({ path: result.path, expectedTables: result.tables, config });
  // Only the path goes to stdout. The cutover script captures it.
  process.stdout.write(result.path);
  process.exit(0);
} catch (err) {
  console.error(`backup failed: ${err.message}`);
  process.exit(1);
}
