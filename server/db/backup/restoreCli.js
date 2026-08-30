import { restoreBackup } from './restore.js';

const path = process.argv[2];
if (!path) {
  console.error('usage: restoreCli.js <dump-path>');
  process.exit(1);
}

const config = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'via',
};

try {
  await restoreBackup({ path, config });
  process.exit(0);
} catch (err) {
  console.error(`restore failed: ${err.message}`);
  process.exit(1);
}
