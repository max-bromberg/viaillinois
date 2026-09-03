import { eq } from 'drizzle-orm';
import { query } from '../pool.js';
import { db } from '../client.ts';
import { midterms } from '../schema/schema.ts';
import { campusNow } from '../../lib/timezone.js';
import { pageClause, pageParams } from './paging.js';

/**
 * List midterms, optionally filtered by course_code and date range.
 *
 * endingOnOrAfter hides exams that have already finished. It belongs here
 * rather than in the caller, because a limit applied to the whole table and a
 * filter applied afterwards disagree: the limit would cut the page before the
 * filter ran, and a caller asking for ten upcoming exams could be handed an
 * empty page while the rows it wanted sat behind the cut.
 *
 * limit and offset are optional, and a caller that passes neither still gets
 * every matching row, which is what the admin listing and the sitemap want.
 *
 * @param {{ courseCode?: string, startDate?: string, endDate?: string,
 *           endingOnOrAfter?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<Array<{ midterm_id, title, course_code, course_title, start_time, end_time, status, building, room_number, submitted_by }>>}
 */
export async function getMidterms(filters = {}) {
  const { courseCode, startDate, endDate, endingOnOrAfter, limit, offset } = filters
  const params = []
  let whereClauses = []
  
  if (courseCode) {
    whereClauses.push('c.course_code = ?')
    params.push(courseCode)
  }
  if (startDate) {
    whereClauses.push('m.start_time >= ?')
    params.push(startDate)
  }
  if (endDate) {
    whereClauses.push('m.start_time <= ?')
    params.push(endDate)
  }
  if (endingOnOrAfter) {
    whereClauses.push('m.end_time >= ?')
    params.push(endingOnOrAfter)
  }

  const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : ''
  // Whether an exam is upcoming, ongoing or past is judged against the campus
  // clock. NOW() is the database container's clock, which is not the same one.
  const now = campusNow()
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
            WHEN ? < m.start_time THEN 'upcoming'
            WHEN ? BETWEEN m.start_time AND m.end_time THEN 'ongoing'
            ELSE 'past'
        END AS status,
        m.location_text,
        l.building,
        l.room_number,
        m.submitted_by
    FROM Midterms m
    JOIN Courses c ON m.course_code = c.course_code
    LEFT JOIN Locations l ON m.location_id = l.location_id
    ${whereClause}
    ORDER BY m.start_time ASC
    ${pageClause(limit, offset)}
    `,
    [now, now, ...params, ...pageParams(limit, offset)]
  )
}

/**
 * Insert a new midterm entry.
 * @param {{ course_code: string, submitted_by?: string|null, location_id?: number|null,
 *           location_text?: string|null, external_uid?: string|null, status?: string,
 *           title: string, start_time: string, end_time: string }} data
 * @returns {Promise<{ insertId: number }>}
 */
export async function createMidterm(data) {
  return query('INSERT INTO Midterms SET ?', [data])
}

/**
 * Update mutable fields of a midterm.
 * @param {number} midtermId
 * @param {object} updates
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function updateMidterm(midtermId, updates) {
  return query('UPDATE Midterms SET ? WHERE midterm_id = ?', [updates, midtermId])
}

/**
 * Find midterms that came from a calendar, by the identifiers it gave them.
 * @param {string[]} uids
 * @returns {Promise<Array<{ midterm_id: number, external_uid: string }>>}
 */
export async function findMidtermsByUid(uids) {
  if (!uids || uids.length === 0) return []
  return query('SELECT midterm_id, external_uid FROM Midterms WHERE external_uid IN (?)', [uids])
}

/**
 * Confirmed midterms for calendar display.
 * @param {{ limit?: number, offset?: number }} [page] omit both for every row,
 *   which is what the sitemap builder wants.
 * @returns {Promise<Array<{ midterm_id, title, course_code, start_time, end_time, building, room_number }>>}
 */
export async function getConfirmedMidterms({ limit, offset } = {}) {
  return query(
    `SELECT m.midterm_id, m.title, m.course_code, m.start_time, m.end_time, m.location_text,
            l.building, l.room_number
     FROM Midterms m
     LEFT JOIN Locations l ON m.location_id = l.location_id
     WHERE m.status = "Confirmed" AND m.end_time > ?
     ORDER BY m.start_time ASC
     ${pageClause(limit, offset)}`,
    [campusNow(), ...pageParams(limit, offset)]
  )
}

/**
 * All midterms for admin review, including DB confirmation status field.
 * @returns {Promise<Array<{ midterm_id, title, course_code, course_title, start_time, end_time, confirmation_status, building, room_number, submitted_by }>>}
 */
export async function getAllMidtermsAdmin() {
  return query('SELECT m.midterm_id, m.title, m.course_code, c.title AS course_title, m.start_time, m.end_time, m.status AS confirmation_status, m.location_text, l.building, l.room_number, m.submitted_by FROM Midterms m JOIN Courses c ON m.course_code = c.course_code LEFT JOIN Locations l ON m.location_id = l.location_id ORDER BY m.start_time DESC')
}

/**
 * Set midterm confirmation status.
 * @param {number} midtermId
 * @param {'Pending'|'Confirmed'|'Cancelled'} status
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function setMidtermStatus(midtermId, status) {
  return query('UPDATE Midterms SET status = ? WHERE midterm_id = ?', [status, midtermId])
}

/**
 * Remove a midterm outright.
 *
 * Cancelling leaves the row in place, which is right for an exam that was
 * scheduled and then called off, and wrong for one that should never have been
 * listed at all. An admin needs both.
 *
 * A midterm that came from the HKN calendar is recreated by the next import of
 * that calendar, because the import matches on external_uid and finds nothing.
 * Cancelling is the way to keep one of those off the page for good.
 *
 * Written with Drizzle, which is the direction the data layer is moving in.
 *
 * @param {number} midtermId
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function deleteMidterm(midtermId) {
  const [result] = await db.delete(midterms).where(eq(midterms.midtermId, midtermId))
  return { affectedRows: result.affectedRows }
}

/**
 * Fetch confirmed midterms for use by the intelligent scheduler.
 * Filters to status = 'Confirmed' in the DB (not the computed upcoming/past status).
 * Optionally filters by course codes and date range.
 * @param {{
 *   startDate?: string,    - YYYY-MM-DD or MySQL DATETIME string
 *   endDate?: string,      - YYYY-MM-DD or MySQL DATETIME string
 *   courseCodes?: string[] - if non-empty, filter to these courses; empty array returns all confirmed midterms
 * }} filters
 * @returns {Promise<Array<{
 *   midterm_id: number,
 *   course_code: string,
 *   title: string,
 *   start_time: string,
 *   end_time: string
 * }>>}
 */
export async function getConfirmedMidtermsForScheduler(filters = {}) {
  const { startDate, endDate, courseCodes } = filters
  const params = []
  let whereClauses = ['m.status = "Confirmed"']
  
  if (startDate) {
    whereClauses.push('m.start_time >= ?')
    params.push(startDate)
  }
  if (endDate) {
    whereClauses.push('m.start_time <= ?')
    params.push(endDate)
  }
  if (courseCodes && courseCodes.length > 0) {
    const placeholders = courseCodes.map(() => '?').join(', ')
    whereClauses.push(`m.course_code IN (${placeholders})`)
    params.push(...courseCodes)
  }

  const whereClause = 'WHERE ' + whereClauses.join(' AND ')
  return query(
    `
    SELECT m.midterm_id, m.course_code, m.title, m.start_time, m.end_time
    FROM Midterms m
    ${whereClause}
    ORDER BY m.start_time ASC
    `,
    params
  )
}
