/**
 * seed.js
 * Inserts demo data: RSOs, Users, Events, Tags, Event_Tags, RSVPs, Midterms, Midterm_Votes.
 * Produces 1000+ rows in RSVPs and Midterm_Votes for Stage 3 row count requirement.
 *
 * Usage: node server/scripts/seed.js
 * Run AFTER scrape_courses.js (needs Locations + Courses rows to reference).
 * Safe to re-run — uses INSERT IGNORE throughout.
 */

import 'dotenv/config';
import pool, { query } from '../db/pool.js';

// --- Seed data definitions ---

const RSOS = [
  { name: 'IEEE UIUC',   description: 'Institute of Electrical and Electronics Engineers student branch', logo_color: '#00629B', founded_year: 1952 },
  { name: 'HKN',         description: 'Eta Kappa Nu ECE honor society',                                  logo_color: '#E8A900', founded_year: 1904 },
  { name: 'iRobotics',   description: 'Competitive robotics club',                                        logo_color: '#FF5F05', founded_year: 2001 },
  { name: 'ECE PULSE',   description: 'ECE outreach and social organization',                             logo_color: '#13294B', founded_year: 2010 },
  { name: 'ECESAC',      description: 'ECE Student Advancement Committee',                                logo_color: '#1D58A7', founded_year: 2005 },
  { name: 'WECE',        description: 'Women in Electrical and Computer Engineering',                     logo_color: '#E84A27', founded_year: 1995 },
  { name: 'Solar Car',   description: 'UIUC Solar Car Team',                                             logo_color: '#F5A800', founded_year: 1993 },
];

const TAGS = ['Free Food', 'Workshop', 'Social', 'Corporate', 'Competition', 'Weekly Meeting', 'Speaker', 'Networking'];

const USERS = Array.from({ length: 50 }, (_, i) => ({
  net_id:    `user${String(i).padStart(3, '0')}`,
  full_name: `Demo User ${i}`,
  email:     `user${i}@illinois.edu`,
  is_global_admin: i === 0,
}));

// Generate 200 events spread across RSOs
function generateEvents(rsoIds, locationIds) {
  const events = [];
  const titles = [
    'Weekly General Meeting', 'Industry Panel', 'Workshop: PCB Design',
    'Pizza Social', 'Interview Prep Session', 'Project Demo Night',
    'Alumni Networking Night', 'Hackathon Kickoff', 'Technical Talk',
    'End of Semester Celebration',
  ];
  const base = new Date('2026-01-15');
  for (let i = 0; i < 200; i++) {
    const start = new Date(base.getTime() + i * 2 * 24 * 60 * 60 * 1000);
    const end   = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    events.push({
      rso_id:      rsoIds[i % rsoIds.length],
      created_by:  USERS[i % USERS.length].net_id,
      location_id: locationIds[i % locationIds.length],
      title:       titles[i % titles.length],
      description: `Event ${i} — auto-generated for demo purposes.`,
      start_time:  start.toISOString().slice(0, 19).replace('T', ' '),
      end_time:    end.toISOString().slice(0, 19).replace('T', ' '),
      is_private:  i % 10 === 0,
    });
  }
  return events;
}

// Generate 50 midterms spread across courses and locations
function generateMidterms(courseCodes, locationIds, submitterNetIds) {
  const midterms = [];
  const base = new Date('2026-03-01');
  for (let i = 0; i < 50; i++) {
    const start = new Date(base.getTime() + i * 3 * 24 * 60 * 60 * 1000);
    const end   = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    midterms.push({
      course_code:  courseCodes[i % courseCodes.length],
      submitted_by: submitterNetIds[i % submitterNetIds.length],
      location_id:  locationIds[i % locationIds.length],
      title:        `Midterm ${i + 1}`,
      start_time:   start.toISOString().slice(0, 19).replace('T', ' '),
      end_time:     end.toISOString().slice(0, 19).replace('T', ' '),
      status:       ['Pending', 'Confirmed', 'Confirmed', 'Confirmed'][i % 4],
    });
  }
  return midterms;
}

// Generate 1250 Midterm_Votes (50 users × 25 midterms each = 1250)
function generateMidtermVotes(userNetIds, midtermIds) {
  const votes = [];
  for (let u = 0; u < userNetIds.length; u++) {
    for (let m = 0; m < Math.min(25, midtermIds.length); m++) {
      votes.push({
        midterm_id: midtermIds[(u + m) % midtermIds.length],
        net_id:     userNetIds[u],
        vote_value: (u + m) % 3 === 0 ? -1 : 1,
      });
    }
  }
  return votes;
}

// Assign users to RSOs: 1 Admin + 2 Board + 4 Members per RSO, plus each user joins a second RSO as Member
function generateMemberships(userNetIds, rsoIds) {
  const memberships = [];
  const seen = new Set();
  const roles = ['Admin', 'Board', 'Board', 'Member', 'Member', 'Member', 'Member'];
  for (let j = 0; j < rsoIds.length; j++) {
    for (let k = 0; k < roles.length; k++) {
      const netId = userNetIds[(j * 7 + k) % userNetIds.length];
      const key = `${netId}:${rsoIds[j]}`;
      if (!seen.has(key)) {
        seen.add(key);
        memberships.push({ net_id: netId, rso_id: rsoIds[j], role: roles[k] });
      }
    }
  }
  // Second RSO membership for every user
  for (let i = 0; i < userNetIds.length; i++) {
    const rsoId = rsoIds[(i + 1) % rsoIds.length];
    const key = `${userNetIds[i]}:${rsoId}`;
    if (!seen.has(key)) {
      seen.add(key);
      memberships.push({ net_id: userNetIds[i], rso_id: rsoId, role: 'Member' });
    }
  }
  return memberships;
}

// Generate 1000+ RSVPs (50 users × 25 events each = 1250)
function generateRsvps(userNetIds, eventIds) {
  const statuses = ['Going', 'Maybe', 'Not Going'];
  const rsvps = [];
  for (let u = 0; u < userNetIds.length; u++) {
    for (let e = 0; e < Math.min(25, eventIds.length); e++) {
      rsvps.push({
        net_id:   userNetIds[u],
        event_id: eventIds[(u + e) % eventIds.length],
        status:   statuses[(u + e) % statuses.length],
      });
    }
  }
  return rsvps;
}

// --- SQL implementations ---

async function insertTag(tagName) {
  return query('INSERT IGNORE INTO Tags (tag_name) VALUES (?)', [tagName]);
}

async function insertRso(rso) {
  return query(
    'INSERT IGNORE INTO RSOs (name, description, logo_color, founded_year) VALUES (?, ?, ?, ?)',
    [rso.name, rso.description, rso.logo_color, rso.founded_year]
  );
}

async function insertUser(user) {
  return query(
    'INSERT IGNORE INTO Users (net_id, full_name, email, is_global_admin) VALUES (?, ?, ?, ?)',
    [user.net_id, user.full_name, user.email, user.is_global_admin]
  );
}

async function insertEvent(event) {
  return query(
    `INSERT IGNORE INTO Events
       (rso_id, created_by, location_id, title, description, start_time, end_time, is_private)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.rso_id, event.created_by, event.location_id, event.title,
     event.description, event.start_time, event.end_time, event.is_private]
  );
}

async function insertEventTag(eventId, tagName) {
  return query('INSERT IGNORE INTO Event_Tags (event_id, tag_name) VALUES (?, ?)', [eventId, tagName]);
}

async function insertRsvp(rsvp) {
  return query(
    'INSERT IGNORE INTO RSVPs (net_id, event_id, status) VALUES (?, ?, ?)',
    [rsvp.net_id, rsvp.event_id, rsvp.status]
  );
}

async function insertMidterm(midterm) {
  return query(
    `INSERT IGNORE INTO Midterms
       (course_code, submitted_by, location_id, title, start_time, end_time, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [midterm.course_code, midterm.submitted_by, midterm.location_id, midterm.title,
     midterm.start_time, midterm.end_time, midterm.status]
  );
}

async function insertMembership(netId, rsoId, role) {
  return query(
    'INSERT IGNORE INTO RSO_Memberships (net_id, rso_id, role) VALUES (?, ?, ?)',
    [netId, rsoId, role]
  );
}

async function insertMidtermVote(vote) {
  return query(
    'INSERT IGNORE INTO Midterm_Votes (midterm_id, net_id, vote_value) VALUES (?, ?, ?)',
    [vote.midterm_id, vote.net_id, vote.vote_value]
  );
}

async function getSomeCourseCodes(limit) {
  return query(`SELECT course_code FROM Courses LIMIT ${parseInt(limit, 10)}`);
}

async function getSomeLocationIds(limit) {
  return query(`SELECT location_id FROM Locations LIMIT ${parseInt(limit, 10)}`);
}

async function main() {
  console.log('Seeding database...');

  // Tags
  for (const tag of TAGS) {
    await insertTag(tag);
  }

  // RSOs
  for (const rso of RSOS) {
    await insertRso(rso);
  }
  // Always fetch canonical IDs — INSERT IGNORE may skip rows on re-run
  const rsoPlaceholders = RSOS.map(() => '?').join(', ');
  const rsoRows = await query(`SELECT rso_id FROM RSOs WHERE name IN (${rsoPlaceholders}) ORDER BY rso_id`, RSOS.map(r => r.name));
  const rsoIds = rsoRows.map(r => r.rso_id);

  // Users
  for (const user of USERS) {
    await insertUser(user);
  }

  // RSO_Memberships
  const memberships = generateMemberships(USERS.map(u => u.net_id), rsoIds);
  for (const m of memberships) {
    await insertMembership(m.net_id, m.rso_id, m.role);
  }

  // Events (needs locations from scraper)
  const locationRows = await getSomeLocationIds(50);
  const locationIds = locationRows.length ? locationRows.map(r => r.location_id) : [1];

  const events = generateEvents(rsoIds.length ? rsoIds : [1], locationIds);
  const eventIds = [];
  for (const event of events) {
    const result = await insertEvent(event);
    if (result.insertId) {
      eventIds.push(result.insertId);
      const tags = [...TAGS].sort(() => Math.random() - 0.5).slice(0, 6);
      for (const tag of tags) {
        await insertEventTag(result.insertId, tag);
      }
    }
  }

  // RSVPs
  const rsvps = generateRsvps(USERS.map(u => u.net_id), eventIds.length ? eventIds : Array.from({length: 200}, (_, i) => i + 1));
  for (const rsvp of rsvps) {
    await insertRsvp(rsvp);
  }

  // Midterms + Midterm_Votes (third 1000+ row table for Stage 3)
  const courseRows = await getSomeCourseCodes(50);
  const courseCodes = courseRows.length ? courseRows.map(r => r.course_code) : ['ECE 110'];

  const midterms = generateMidterms(courseCodes, locationIds, USERS.map(u => u.net_id));
  const midtermIds = [];
  for (const midterm of midterms) {
    const result = await insertMidterm(midterm);
    if (result.insertId) midtermIds.push(result.insertId);
  }

  const midtermVotes = generateMidtermVotes(
    USERS.map(u => u.net_id),
    midtermIds.length ? midtermIds : Array.from({length: 50}, (_, i) => i + 1)
  );
  for (const vote of midtermVotes) {
    await insertMidtermVote(vote);
  }

  // Row counts for Stage 3
  const tables = ['Users', 'RSOs', 'RSO_Memberships', 'Events', 'RSVPs', 'Tags', 'Event_Tags', 'Midterms', 'Midterm_Votes'];
  console.log('\n=== Row Counts (Screenshot for Stage 3) ===');
  for (const t of tables) {
    const [row] = await query(`SELECT COUNT(*) AS cnt FROM ${t}`);
    console.log(`${t.padEnd(15)}: ${row.cnt}`);
  }

  await pool.end();
  console.log('\nSeed complete.');
}

main().catch(console.error);
