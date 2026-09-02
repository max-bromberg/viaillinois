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

export function updateEvent(id, data) {
  return apiFetch(`/api/v1/events/${id}`, { method: 'PUT', body: data });
}

export function deleteEvent(id) {
  return apiFetch(`/api/v1/events/${id}`, { method: 'DELETE' });
}

export function getKioskEvents(limit = 10) {
  return apiFetch(`/api/v1/kiosk/events?limit=${limit}`);
}
