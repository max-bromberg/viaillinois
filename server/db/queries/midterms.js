import { query } from '../pool.js';

/**
 * List midterms with vote scores, optionally filtered by course_code.
 * @param {{ courseCode?: string }} filters
 * @returns {Promise<Array<{ midterm_id, title, course_code, course_title, start_time, end_time, status, building, room_number, score, submitted_by }>>}
 * TODO: write query
 */
export async function getMidterms(filters = {}) {
  // TODO: write query
  const { courseCode } = filters
  const params = []
  let whereClause = ''
  if (courseCode) {
    whereClause = 'WHERE c.course_code = ?'
    params.push(courseCode)
  }
  return query( // apparently case statements is a thing https://www.w3schools.com/sql/func_mysql_case.asp
    `
    SELECT
        m.midterm_id,
        m.title,
        c.course_code,
        c.title AS course_title,
        m.start_time,
        m.end_time,
        CASE
            WHEN NOW() < m.start_time THEN 'upcoming'
            WHEN NOW() BETWEEN m.start_time AND m.end_time THEN 'ongoing'
            ELSE 'past'
        END AS status,
        l.building,
        l.room_number,
        COALESCE(SUM(v.vote_value), 0) AS score,
        m.submitted_by
    FROM Midterms m
    JOIN Courses c ON m.course_code = c.course_code
    JOIN Locations l ON m.location_id = l.location_id
    LEFT JOIN Midterm_Votes v ON m.midterm_id = v.midterm_id
    ${whereClause}
    GROUP BY m.midterm_id
    ORDER BY score DESC, m.start_time DESC
    `,
    params
  )
}

/**
 * Insert a new midterm entry.
 * @param {{ course_code: string, submitted_by: string, location_id: number, title: string, start_time: string, end_time: string }} data
 * @returns {Promise<{ insertId: number }>}
 * TODO: write query
 */
export async function createMidterm(data) {
  // TODO: write query
  const { course_code, submitted_by, location_id, title, start_time, end_time } = data
  return query(
    'INSERT INTO Midterms (course_code, submitted_by, location_id, title, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)',
    [course_code, submitted_by, location_id, title, start_time, end_time]
  )
}

/**
 * Upsert a vote for a midterm (one vote per user per midterm).
 * @param {number} midtermId
 * @param {string} netId
 * @param {1|-1} voteValue
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function upsertVote(midtermId, netId, voteValue) {
  // TODO: write query
  return query(
    'INSERT INTO Midterm_Votes (midterm_id, net_id, vote_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE vote_value = ?',
    [midtermId, netId, voteValue, voteValue]
  )
}
