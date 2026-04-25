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
 * @param {string} dayOfWeek   - e.g. "MWF", "TR"
 * @param {string} startTime   - TIME string "HH:MM:SS"
 * @param {string} endTime     - TIME string "HH:MM:SS"
 * @param {string} semester    - e.g. "spring", "fall"
 * @param {string} sectionType - normalized type: 'lecture'|'lab'|'discussion'|'online'|'other'
 * @returns {Promise<void>}
 */
export async function upsertSection(courseCode, locationId, dayOfWeek, startTime, endTime, semester, sectionType) {
  return query('INSERT IGNORE INTO Course_Sections (course_code, location_id, day_of_week, start_time, end_time, semester, section_type) VALUES (?, ?, ?, ?, ?, ?, ?)', [courseCode, locationId, dayOfWeek, startTime, endTime, semester, sectionType])
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

/**
 * Batch fetch all sections for multiple courses.
 * Used by the intelligent scheduler to detect class time conflicts.
 * @param {string[]} courseCodes - e.g. ['ECE 110', 'ECE 385']. Must be non-empty; caller is responsible for guarding (empty array produces invalid IN () SQL).
 * @returns {Promise<Array<{
 *   section_id: number,
 *   course_code: string,
 *   day_of_week: string,
 *   start_time: string,
 *   end_time: string,
 *   semester: string,
 *   section_type: string|null,
 *   building: string,
 *   room_number: string
 * }>>}
 */
export async function getSectionsForCourses(courseCodes) {
  // TODO: write query
  const placeholders = courseCodes.map(() => '?').join(', ')
  return query(`
    SELECT cs.section_id, cs.course_code, cs.day_of_week, cs.start_time, cs.end_time, cs.semester, cs.section_type, l.building, l.room_number
    FROM Course_Sections cs
    JOIN Locations l ON cs.location_id = l.location_id
    WHERE cs.course_code IN (${placeholders})
  `, courseCodes)
}
