import { query } from '../pool.js';

/**
 * Upsert a course row. Safe to re-run across semesters.
 * @param {string} courseCode - e.g. "ECE 385"
 * @param {string} title      - e.g. "Digital Systems Laboratory"
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function upsertCourse(courseCode, title) {
  // TODO: write query
  return query('INSERT IGNORE INTO Courses (course_code, title) VALUES (?, ?)', [courseCode, title])
}

/**
 * Upsert a course section row. Safe to re-run (idempotent by natural key).
 * @param {string} courseCode
 * @param {number} locationId
 * @param {string} dayOfWeek  - e.g. "MWF", "TR"
 * @param {string} startTime  - TIME string "HH:MM:SS"
 * @param {string} endTime    - TIME string "HH:MM:SS"
 * @param {string} semester   - e.g. "spring", "fall"
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function upsertSection(courseCode, locationId, dayOfWeek, startTime, endTime, semester) {
  // TODO: write query
  return query('INSERT IGNORE INTO Course_Sections (course_code, location_id, day_of_week, start_time, end_time, semester) VALUES (?, ?, ?, ?, ?, ?)', [courseCode, locationId, dayOfWeek, startTime, endTime, semester])
}

/**
 * List all courses (used to populate midterm submission form dropdown).
 * @returns {Promise<Array<{ course_code, title }>>}
 * TODO: write query
 */
export async function getCourses() {
  // TODO: write query
  return query('SELECT course_code, title FROM Courses ORDER BY course_code')
}

/**
 * Get all sections for a course.
 * @param {string} courseCode
 * @returns {Promise<Array<{ section_id, day_of_week, start_time, end_time, semester, building, room_number }>>}
 * TODO: write query
 */
export async function getSectionsByCourse(courseCode) {
  // TODO: write query
  return query('SELECT cs.section_id, cs.day_of_week, cs.start_time, cs.end_time, cs.semester, l.building, l.room_number FROM Course_Sections cs JOIN Locations l ON cs.location_id = l.location_id WHERE cs.course_code = ?', [courseCode])
}
