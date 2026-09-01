/**
 * seedDevFixtures.js
 *
 * Rooms and courses for a local preview database.
 *
 * seed.js needs Locations and Courses rows to hang events and midterms on, and
 * the only thing that creates those in production is the pollers, which talk to
 * Ad Astra and Course Explorer over the network. This inserts a small, real
 * looking set instead, so a preview database can be built without reaching out
 * to the university at all.
 *
 * Building names are spelled exactly the way locationNormalizer.js canonicalizes
 * them, so that a search for a code such as ECEB resolves the same way it does
 * against real data.
 *
 * Usage: node --env-file=../.env.dev scripts/seedDevFixtures.js
 * Development only. Never run this against production.
 */

import pool, { query } from '../db/pool.js';

const ROOMS = [
  ['Electrical & Computer Eng Bldg', '1002', 240, 1],
  ['Electrical & Computer Eng Bldg', '1013', 120, 1],
  ['Electrical & Computer Eng Bldg', '2013', 60,  1],
  ['Electrical & Computer Eng Bldg', '3017', 30,  0],
  ['Campus Instructional Facility',  '1025', 200, 1],
  ['Campus Instructional Facility',  '3039', 48,  1],
  ['Siebel Center for Comp Sci',     '1404', 150, 1],
  ['Siebel Center for Comp Sci',     '2405', 40,  0],
  ['Coordinated Science Laboratory', '301',  25,  0],
  ['Digital Computer Laboratory',    '1320', 80,  1],
  ['Everitt Laboratory',             '2310', 45,  1],
  ['Materials Science & Eng Bldg',   '100',  90,  1],
  ['Grainger Engineering Library',   '335',  20,  0],
  ['Illini Union',                   'Ballroom', 400, 1],
];

const COURSES = [
  ['ECE 110', 'Introduction to Electronics'],
  ['ECE 120', 'Introduction to Computing'],
  ['ECE 210', 'Analog Signal Processing'],
  ['ECE 220', 'Computer Systems & Programming'],
  ['ECE 310', 'Digital Signal Processing'],
  ['ECE 313', 'Probability with Engineering Applications'],
  ['ECE 330', 'Power Circuits & Electromechanics'],
  ['ECE 385', 'Digital Systems Laboratory'],
  ['CS 225',  'Data Structures'],
  ['CS 233',  'Computer Architecture'],
  ['MATH 286', 'Introduction to Differential Equations Plus'],
  ['PHYS 212', 'University Physics: Elec & Mag'],
];

async function main() {
  for (const [building, room, capacity, av] of ROOMS) {
    await query(
      'INSERT IGNORE INTO Locations (building, room_number, max_capacity, has_av_equipment) VALUES (?, ?, ?, ?)',
      [building, room, capacity, av]
    );
  }
  for (const [code, title] of COURSES) {
    await query('INSERT IGNORE INTO Courses (course_code, title) VALUES (?, ?)', [code, title]);
  }

  const [{ n: rooms }]   = await query('SELECT COUNT(*) AS n FROM Locations');
  const [{ n: courses }] = await query('SELECT COUNT(*) AS n FROM Courses');
  console.log(`dev fixtures: ${rooms} locations, ${courses} courses`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
