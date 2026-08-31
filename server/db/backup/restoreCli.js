import { restoreBackup } from './restore.js';
import { adminConfigFromEnv } from './config.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: restoreCli.js <dump-path>');
  process.exit(1);
}

const config = adminConfigFromEnv();

try {
  await restoreBackup({ path, config });
  process.exit(0);
} catch (err) {
  console.error(`restore failed: ${err.message}`);
  process.exit(1);
}
