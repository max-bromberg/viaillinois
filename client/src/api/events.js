import { apiFetch } from './base.js';

/**
 * @param {{ tags?: string[], startDate?: string, endDate?: string, keyword?: string,
 *           timeframe?: 'upcoming'|'archived'|'all', limit?: number, offset?: number }} filters
 *   The timeframe divides events at the start of the campus day. Naming none
 *   leaves the choice to the server, which serves upcoming events.
 */
export function getEvents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.keyword)   params.set('keyword', filters.keyword);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate)   params.set('endDate', filters.endDate);
  if (filters.timeframe) params.set('timeframe', filters.timeframe);
  if (filters.limit)     params.set('limit', String(filters.limit));
  if (filters.offset)    params.set('offset', String(filters.offset));
  (filters.tags || []).forEach(t => params.append('tags', t));
  return apiFetch(`/api/v1/events?${params}`);
}

export function getEvent(id) {
  return apiFetch(`/api/v1/events/${id}`);
}

export function createEvent(data) {
  return apiFetch('/api/v1/events', { method: 'POST', body: data });
}

/**
 * Create a repeating event: the rule and every occurrence, in one request.
 *
 * @param {object} data the event, with a recurrence of
 *   { interval_weeks, days_of_week, starts_on, ends_on }
 */
export function createEventSeries(data) {
  return apiFetch('/api/v1/events/series', { method: 'POST', body: data });
}

/**
 * How much of a series a change is for: this occurrence, this one and every
 * later one, or all of them. Left out for an event that does not repeat, where
 * there is only one thing it could mean.
 */
function scoped(id, scope) {
  return scope && scope !== 'one'
    ? `/api/v1/events/${id}?scope=${scope}`
    : `/api/v1/events/${id}`;
}

export function updateEvent(id, data, scope = 'one') {
  return apiFetch(scoped(id, scope), { method: 'PUT', body: data });
}

export function deleteEvent(id, scope = 'one') {
  return apiFetch(scoped(id, scope), { method: 'DELETE' });
}

export function getKioskEvents(limit = 10) {
  return apiFetch(`/api/v1/kiosk/events?limit=${limit}`);
}
