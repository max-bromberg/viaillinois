/**
 * scrape_facilities.js
 * One-shot manual run of the facilities poller.
 * For initial data load or ad-hoc refreshes outside normal server operation.
 *
 * Usage: node server/scripts/scrape_facilities.js
 *
 * In production the poller runs continuously inside the server process.
 * See server/services/facilitiesPoller.js.
 */

import 'dotenv/config';
import pool from '../db/pool.js';
import { runOnce } from '../services/facilitiesPoller.js';

console.log('[facilities] manual run starting...');

try {
  const { upserted, skipped } = await runOnce();
  console.log(`[facilities] done — ${upserted} upserted, ${skipped} skipped`);
} catch (err) {
  console.error('[facilities] failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
