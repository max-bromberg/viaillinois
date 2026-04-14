import { apiFetch } from './base.js';

export function searchLocations(q) {
  return apiFetch(`/api/v1/venues/search?q=${encodeURIComponent(q)}`);
}
