import { query } from '../pool.js';

/**
 * STAGE 3 ADVANCED QUERY 1
 * Public event feed with optional filters.
 * @param {{ tag?: string, startDate?: string, endDate?: string, keyword?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<Array<{event_id, title, description, start_time, end_time, is_private, rso_name, building, room_number, max_capacity, tags}>>}
 * TODO: write query
 */
export async function getPublicEvents(filters = {}) {
  const { keyword = null, startDate = null, endDate = null, tags: rawTags = [], limit = 20, offset = 0 } = filters;
  const tag = rawTags[0] ?? null;
  return query(
  `
  SELECT
      e.event_id,
      e.title,
      e.description,
      e.start_time,
      e.end_time,
      e.is_private,
      r.name AS rso_name,
      l.building,
      l.room_number,
      l.max_capacity,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags
  FROM Events e
  JOIN RSOs r
      ON e.rso_id = r.rso_id
  JOIN Locations l
      ON e.location_id = l.location_id
  LEFT JOIN Event_Tags et
      ON e.event_id = et.event_id
  LEFT JOIN Tags t
      ON et.tag_name = t.tag_name
  WHERE
      e.is_private = FALSE
      AND (
          ? IS NULL OR
          e.title LIKE CONCAT('%', ?, '%') OR
          e.description LIKE CONCAT('%', ?, '%')
      )
      AND (
          (? IS NULL OR e.start_time >= ?) AND
          (? IS NULL OR e.start_time <= ?)
      )
  GROUP BY
      e.event_id
  HAVING
      (? IS NULL OR tags LIKE CONCAT('%', ?, '%'))
  ORDER BY
      e.start_time ASC
  LIMIT ? OFFSET ?
  `,
  [keyword, keyword, keyword, startDate, startDate, endDate, endDate, tag, tag, limit, offset]
)
}

/**
 * All events (public and private) with optional filters.
 * Used when the requesting user has board/admin privileges or is a global admin.
 * Same shape as getPublicEvents but without the is_private = FALSE filter.
 * @param {{ tags?: string[], startDate?: string, endDate?: string, keyword?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<Array<{event_id, title, description, start_time, end_time, is_private, rso_name, building, room_number, max_capacity, tags}>>}
 */
export async function getAllEvents(filters = {}) {
  const { keyword = null, startDate = null, endDate = null, tags: rawTags = [], limit = 20, offset = 0 } = filters;
  const tag = rawTags[0] ?? null;
  return query(
  `
  SELECT
      e.event_id,
      e.title,
      e.description,
      e.start_time,
      e.end_time,
      e.is_private,
      r.name AS rso_name,
      l.building,
      l.room_number,
      l.max_capacity,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags
  FROM Events e
  JOIN RSOs r
      ON e.rso_id = r.rso_id
  JOIN Locations l
      ON e.location_id = l.location_id
  LEFT JOIN Event_Tags et
      ON e.event_id = et.event_id
  LEFT JOIN Tags t
      ON et.tag_name = t.tag_name
  WHERE
      (
          ? IS NULL OR
          e.title LIKE CONCAT('%', ?, '%') OR
          e.description LIKE CONCAT('%', ?, '%')
      )
      AND (
          (? IS NULL OR e.start_time >= ?) AND
          (? IS NULL OR e.start_time <= ?)
      )
  GROUP BY
      e.event_id
  HAVING
      (? IS NULL OR tags LIKE CONCAT('%', ?, '%'))
  ORDER BY
      e.start_time ASC
  LIMIT ? OFFSET ?
  `,
  [keyword, keyword, keyword, startDate, startDate, endDate, endDate, tag, tag, limit, offset]
)
}

/**
 * Single event detail with full joins.
 * @param {number} eventId
 * @returns {Promise<object|null>}
 * TODO: write query
 */
export async function getEventById(eventId) {
  // TODO: write query
  return query(
  `
  SELECT
      e.event_id,
      e.title,
      e.description,
      e.start_time,
      e.end_time,
      e.is_private,
      e.rso_id,
      r.name AS rso_name,
      l.building,
      l.room_number,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags
  FROM Events e
  JOIN RSOs r
      ON e.rso_id = r.rso_id
  JOIN Locations l
      ON e.location_id = l.location_id
  LEFT JOIN Event_Tags et
      ON e.event_id = et.event_id
  LEFT JOIN Tags t
      ON et.tag_name = t.tag_name
  WHERE
      e.event_id = ?
  GROUP BY
      e.event_id
  `,
  [eventId]
).then(results => results[0] || null)
}

/**
 * Insert a new event row.
 * @param {{ rso_id: number, created_by: string, location_id: number, title: string, description: string, start_time: string, end_time: string, is_private: boolean }} eventData
 * @returns {Promise<{ insertId: number }>}
 * TODO: write query
 */
export async function createEvent(eventData) {
  // TODO: write query
  return query('INSERT INTO Events SET ?', [eventData])
}

/**
 * Update mutable fields of an event.
 * @param {number} eventId
 * @param {{ location_id?: number, title?: string, description?: string, start_time?: string, end_time?: string, is_private?: boolean }} updates
 * @returns {Promise<{ affectedRows: number }>}
 * TODO: write query
 */
export async function updateEvent(eventId, updates) {
  // TODO: write query
  return query('UPDATE Events SET ? WHERE event_id = ?', [updates, eventId])
}

/**
 * Delete an event (cascades to Event_Tags, RSVPs).
 * @param {number} eventId
 * @returns {Promise<{ affectedRows: number }>}
 * TODO: write query
 */
export async function deleteEvent(eventId) {
  // TODO: write query
  return query('DELETE FROM Events WHERE event_id = ?', [eventId])
}

/**
 * Upsert RSVP status for a user-event pair.
 * @param {string} netId
 * @param {number} eventId
 * @param {'Going'|'Maybe'|'Not Going'} status
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function upsertRsvp(netId, eventId, status) {
  // TODO: write query
  return query('INSERT INTO RSVPs (net_id, event_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?', [netId, eventId, status, status])
}

/**
 * Next N upcoming public events for kiosk display (minimal payload).
 * @param {number} [limit=10]
 * @returns {Promise<Array<{event_id, title, start_time, end_time, rso_name, building, room_number}>>}
 * TODO: write query
 */
export async function getKioskEvents(limit = 10) {
  // TODO: write query
  return query('SELECT e.event_id, e.title, e.start_time, e.end_time, r.name AS rso_name, l.building, l.room_number FROM Events e JOIN RSOs r ON e.rso_id = r.rso_id JOIN Locations l ON e.location_id = l.location_id WHERE e.is_private = FALSE AND e.start_time > NOW() ORDER BY e.start_time ASC LIMIT ?', [limit])
}

/**
 * Replace all tags for an event (delete existing rows, insert new ones).
 * @param {number} eventId
 * @param {string[]} tagNames
 * @returns {Promise<void>}
 * TODO: write query
 */
export async function setEventTags(eventId, tagNames) {
  // TODO: write query
  if (tagNames.length === 0) {
    return query('DELETE FROM Event_Tags WHERE event_id = ?', [eventId])
  }
  const insertTagsQuery = 'INSERT IGNORE INTO Tags (tag_name) VALUES ?'
  const tagValues = tagNames.map(tag => [tag])
  await query(insertTagsQuery, [tagValues])

  await query('DELETE FROM Event_Tags WHERE event_id = ?', [eventId])

  const insertEventTagsQuery = 'INSERT INTO Event_Tags (event_id, tag_name) VALUES ?'
  const eventTagValues = tagNames.map(tag => [eventId, tag])
  await query(insertEventTagsQuery, [eventTagValues])
}

/**
 * RSVP counts for an event grouped by status.
 * @param {number} eventId
 * @returns {Promise<Array<{ status: string, count: number }>>}
 */
export async function getEventRsvpCounts(eventId) {
  // TODO: write query
  return query('SELECT status, COUNT(*) AS count FROM RSVPs WHERE event_id = ? GROUP BY status', [eventId])
}
