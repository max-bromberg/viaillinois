import { apiFetch } from './base.js';

/**
 * Search rooms by building name, building code or room number.
 * @param {string} q
 */
export const searchVenues = (q) =>
  apiFetch(`/api/v1/venues/search?q=${encodeURIComponent(q)}`);
