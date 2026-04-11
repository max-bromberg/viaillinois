/**
 * scrape_courses.js
 * One-shot manual run of the courses poller.
 * For initial data load or ad-hoc refreshes outside normal server operation.
 *
 * Usage: node server/scripts/scrape_courses.js
 *
 * In production the poller runs continuously inside the server process.
 * See server/services/coursesPoller.js.
 */

import 'dotenv/config';
import pool, { query } from '../db/pool.js';
import { runOnce } from '../services/coursesPoller.js';

console.log('[courses] manual run starting...');

try {
  const { year, semester, totalCourses, totalSections, totalErrors } = await runOnce();
  console.log(`[courses] done — ${semester} ${year}: ${totalCourses} courses, ${totalSections} sections, ${totalErrors} errors`);

  // Row counts for Stage 3 documentation
  try {
    const [courses]   = await query('SELECT COUNT(*) AS cnt FROM Courses');
    const [sections]  = await query('SELECT COUNT(*) AS cnt FROM Course_Sections');
    const [locations] = await query('SELECT COUNT(*) AS cnt FROM Locations');
    console.log('\n=== Row Counts (Screenshot for Stage 3) ===');
    console.log(`Courses:         ${courses.cnt}`);
    console.log(`Course_Sections: ${sections.cnt}`);
    console.log(`Locations:       ${locations.cnt}`);
  } catch {
    console.log('(SQL stubs not yet implemented — row counts unavailable)');
  }
} catch (err) {
  console.error('[courses] failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
