/**
 * create_test_user.js
 * Creates a local-auth test user: net_id="testuser", password="test".
 * Safe to re-run — uses INSERT IGNORE.
 *
 * Usage: node --env-file=.env server/scripts/create_test_user.js
 * Run from the repo root (via/).
 */

import bcrypt from 'bcryptjs';
import pool, { query } from '../db/pool.js';

const NET_ID    = 'testuser';
const PASSWORD  = 'test';
const FULL_NAME = 'Test User';
const EMAIL     = 'testuser@illinois.edu';

const hash = await bcrypt.hash(PASSWORD, 10);

await query(
  'INSERT IGNORE INTO Users (net_id, full_name, email, is_global_admin) VALUES (?, ?, ?, TRUE)',
  [NET_ID, FULL_NAME, EMAIL]
);

await query(
  'INSERT INTO LocalAccounts (net_id, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
  [NET_ID, hash]
);

console.log(`Test user created: net_id="${NET_ID}" password="${PASSWORD}" (global admin)`);
pool.end();
