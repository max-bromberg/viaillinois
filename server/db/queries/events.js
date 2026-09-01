import { query } from '../pool.js';
import { campusNow } from '../../lib/timezone.js';

/**
 * STAGE 3 ADVANCED QUERY 1
 * Public event feed with optional filters.
 * @param {{ tag?: string, startDate?: string, endDate?: string, keyword?: string, limit?: number, offset?: number }} filters
 * @returns {Promise<Array<{event_id, title, description, start_time, end_time, is_private, rso_name, building, room_number, max_capacity, tags}>>}
 */
export async function getPublicEvents(filters = {}) {
    const { keyword = null, startDate = null, endDate = null, tags: rawTags = [], limit = 20, offset = 0 } = filters
    const tag = rawTags[0] ?? null
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
      e.location_text,
      l.building,
      l.room_number,
      l.max_capacity,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags
  FROM Events e
  JOIN RSOs r
      ON e.rso_id = r.rso_id
  LEFT JOIN Locations l
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
    const { keyword = null, startDate = null, endDate = null, tags: rawTags = [], limit = 20, offset = 0 } = filters
    const tag = rawTags[0] ?? null
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
      e.location_text,
      l.building,
      l.room_number,
      l.max_capacity,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags
  FROM Events e
  JOIN RSOs r
      ON e.rso_id = r.rso_id
  LEFT JOIN Locations l
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
 */
export async function getEventById(eventId) {
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
      e.location_text,
      l.building,
      l.room_number,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags
  FROM Events e
  JOIN RSOs r
      ON e.rso_id = r.rso_id
  LEFT JOIN Locations l
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
 * Every public event, for the sitemap.
 *
 * Deliberately not the feed query: that one paginates at twenty, so using it
 * here submitted only the first screenful of events and left the rest for a
 * search engine to find on its own, which is exactly what it cannot do on a
 * page built by JavaScript.
 *
 * @param {number} [limit] a sitemap holds at most fifty thousand addresses
 * @returns {Promise<Array<{ event_id: number, start_time: string }>>}
 */
export async function getPublicEventSitemapEntries(limit = 5000) {
    return query(
        `SELECT event_id, start_time FROM Events
          WHERE is_private = FALSE
          ORDER BY start_time DESC
          LIMIT ?`,
        [limit]
    )
}

/**
 * Find events in an RSO that came from a calendar, by the identifiers that
 * calendar gave them. Used by the importer to tell a second import of the same
 * file from a first one.
 *
 * @param {number} rsoId
 * @param {string[]} uids
 * @returns {Promise<Array<{ event_id: number, external_uid: string }>>}
 */
export async function findEventsByUid(rsoId, uids) {
    if (!uids || uids.length === 0) return []
    return query(
        'SELECT event_id, external_uid FROM Events WHERE rso_id = ? AND external_uid IN (?)',
        [rsoId, uids]
    )
}

/**
 * Insert a new event row.
 * @param {{ rso_id: number, created_by: string, location_id: number, title: string, description: string, start_time: string, end_time: string, is_private: boolean }} eventData
 * @returns {Promise<{ insertId: number }>}
 */
export async function createEvent(eventData) {
    return query('INSERT INTO Events SET ?', [eventData])
}

/**
 * Update mutable fields of an event.
 * @param {number} eventId
 * @param {{ location_id?: number, title?: string, description?: string, start_time?: string, end_time?: string, is_private?: boolean }} updates
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function updateEvent(eventId, updates) {
    return query('UPDATE Events SET ? WHERE event_id = ?', [updates, eventId])
}

/**
 * Delete an event (cascades to Event_Tags, RSVPs).
 * @param {number} eventId
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function deleteEvent(eventId) {
    return query('DELETE FROM Events WHERE event_id = ?', [eventId])
}

/**
 * Upsert RSVP status for a user-event pair.
 * @param {string} netId
 * @param {number} eventId
 * @param {'Going'|'Maybe'|'Not Going'} status
 * @returns {Promise<void>}
 */
export async function upsertRsvp(netId, eventId, status) {
    return query('INSERT INTO RSVPs (net_id, event_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?', [netId, eventId, status, status])
}

/**
 * Next N upcoming public events for kiosk display (minimal payload).
 * @param {number} [limit=10]
 * @returns {Promise<Array<{event_id, title, start_time, end_time, rso_name, building, room_number}>>}
 */
export async function getKioskEvents(limit = 10) {
    return query('SELECT e.event_id, e.title, e.start_time, e.end_time, r.name AS rso_name, e.location_text, l.building, l.room_number FROM Events e JOIN RSOs r ON e.rso_id = r.rso_id LEFT JOIN Locations l ON e.location_id = l.location_id WHERE e.is_private = FALSE AND e.start_time > ? ORDER BY e.start_time ASC LIMIT ?', [campusNow(), limit])
}

/**
 * Replace all tags for an event (delete existing rows, insert new ones).
 * @param {number} eventId
 * @param {string[]} tagNames
 * @returns {Promise<void>}
 */
export async function setEventTags(eventId, tagNames) {
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
 * All events for a given RSO (used by the dashboard).
 * @param {number} rsoId
 * @returns {Promise<Array<{ event_id, title, description, start_time, end_time, is_private, rso_name, building, room_number, max_capacity, tags }>>}
 */
export async function getEventsByRso(rsoId) {
    return query('SELECT e.event_id, e.title, e.description, e.start_time, e.end_time, e.is_private, r.name AS rso_name, e.location_text, l.building, l.room_number, l.max_capacity, GROUP_CONCAT(t.tag_name) AS tags FROM Events e JOIN RSOs r ON e.rso_id = r.rso_id LEFT JOIN Locations l ON e.location_id = l.location_id LEFT JOIN Event_Tags et ON e.event_id = et.event_id LEFT JOIN Tags t ON et.tag_name = t.tag_name WHERE e.rso_id = ? GROUP BY e.event_id ORDER BY e.start_time ASC', [rsoId])
}

/**
 * Events visible to an authenticated non-admin user: all public events plus
 * private events belonging to any RSO the user is a member of.
 * @param {{ tags?: string[], startDate?: string, endDate?: string, keyword?: string, limit?: number, offset?: number }} filters
 * @param {number[]} memberRsoIds - RSO IDs the requesting user belongs to
 */
export async function getVisibleEvents(filters = {}, memberRsoIds = []) {
  if (!memberRsoIds.length) return getPublicEvents(filters);
  const { keyword = null, startDate = null, endDate = null, tags: rawTags = [], limit = 20, offset = 0 } = filters;
  const tag = rawTags[0] ?? null;
  return query(
    `SELECT
      e.event_id, e.title, e.description, e.start_time, e.end_time, e.is_private,
      r.name AS rso_name, e.location_text, l.building, l.room_number, l.max_capacity,
      GROUP_CONCAT(t.tag_name ORDER BY t.tag_name SEPARATOR ', ') AS tags
    FROM Events e
    JOIN RSOs r ON e.rso_id = r.rso_id
    LEFT JOIN Locations l ON e.location_id = l.location_id
    LEFT JOIN Event_Tags et ON e.event_id = et.event_id
    LEFT JOIN Tags t ON et.tag_name = t.tag_name
    WHERE (e.is_private = FALSE OR e.rso_id IN (?))
      AND (? IS NULL OR e.title LIKE CONCAT('%',?,'%') OR e.description LIKE CONCAT('%',?,'%'))
      AND (? IS NULL OR e.start_time >= ?)
      AND (? IS NULL OR e.start_time <= ?)
    GROUP BY e.event_id
    HAVING (? IS NULL OR tags LIKE CONCAT('%',?,'%'))
    ORDER BY e.start_time ASC
    LIMIT ? OFFSET ?`,
    [memberRsoIds, keyword, keyword, keyword, startDate, startDate, endDate, endDate, tag, tag, limit, offset]
  );
}

/**
 * Count of events visible to an authenticated non-admin user (no LIMIT/OFFSET).
 * @param {{ tags?: string[], startDate?: string, endDate?: string, keyword?: string }} filters
 * @param {number[]} memberRsoIds
 */
export async function countVisibleEvents(filters = {}, memberRsoIds = []) {
  if (!memberRsoIds.length) return countPublicEvents(filters);
  const { keyword = null, startDate = null, endDate = null, tags: rawTags = [] } = filters;
  const tag = rawTags[0] ?? null;
  return query(
    `SELECT COUNT(DISTINCT e.event_id) AS total
    FROM Events e
    JOIN RSOs r ON e.rso_id = r.rso_id
    LEFT JOIN Locations l ON e.location_id = l.location_id
    LEFT JOIN Event_Tags et ON e.event_id = et.event_id
    LEFT JOIN Tags t ON et.tag_name = t.tag_name
    WHERE (e.is_private = FALSE OR e.rso_id IN (?))
      AND (? IS NULL OR e.title LIKE CONCAT('%',?,'%') OR e.description LIKE CONCAT('%',?,'%'))
      AND (? IS NULL OR e.start_time >= ?)
      AND (? IS NULL OR e.start_time <= ?)
      AND (? IS NULL OR t.tag_name = ?)`,
    [memberRsoIds, keyword, keyword, keyword, startDate, startDate, endDate, endDate, tag, tag]
  );
}

/**
 * Total count of public events matching the given filters (no LIMIT/OFFSET).
 * @param {{ keyword?: string, startDate?: string, endDate?: string, tags?: string[] }} filters
 * @returns {Promise<[{ total: number }]>}
 */
export async function countPublicEvents(filters = {}) {
    const { keyword = null, startDate = null, endDate = null, tags: rawTags = [] } = filters
    const tag = rawTags[0] ?? null
    return query(
        `
  SELECT COUNT(DISTINCT e.event_id) AS total
  FROM Events e
  JOIN RSOs r ON e.rso_id = r.rso_id
  LEFT JOIN Locations l ON e.location_id = l.location_id
  LEFT JOIN Event_Tags et ON e.event_id = et.event_id
  LEFT JOIN Tags t ON et.tag_name = t.tag_name
  WHERE e.is_private = FALSE
    AND (
        ? IS NULL OR
        e.title LIKE CONCAT('%', ?, '%') OR
        e.description LIKE CONCAT('%', ?, '%')
    )
    AND (
        (? IS NULL OR e.start_time >= ?) AND
        (? IS NULL OR e.start_time <= ?)
    )
    AND (
        ? IS NULL OR t.tag_name = ?
    )
  `,
        [keyword, keyword, keyword, startDate, startDate, endDate, endDate, tag, tag]
    )
}

/**
 * Total count of all events (public + private) matching the given filters (no LIMIT/OFFSET).
 * @param {{ keyword?: string, startDate?: string, endDate?: string, tags?: string[] }} filters
 * @returns {Promise<[{ total: number }]>}
 */
export async function countAllEvents(filters = {}) {
    const { keyword = null, startDate = null, endDate = null, tags: rawTags = [] } = filters
    const tag = rawTags[0] ?? null
    return query(
        `
  SELECT COUNT(DISTINCT e.event_id) AS total
  FROM Events e
  JOIN RSOs r ON e.rso_id = r.rso_id
  LEFT JOIN Locations l ON e.location_id = l.location_id
  LEFT JOIN Event_Tags et ON e.event_id = et.event_id
  LEFT JOIN Tags t ON et.tag_name = t.tag_name
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
    AND (
        ? IS NULL OR t.tag_name = ?
    )
  `,
        [keyword, keyword, keyword, startDate, startDate, endDate, endDate, tag, tag]
    )
}

/**
 * RSVP counts for an event grouped by status.
 * @param {number} eventId
 * @returns {Promise<Array<{ status: string, count: number }>>}
 */
export async function getEventRsvpCounts(eventId) {
    return query('SELECT status, COUNT(*) AS count FROM RSVPs WHERE event_id = ? GROUP BY status', [eventId])
}
