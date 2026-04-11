import { apiFetch } from './base.js';
export const recommendVenue = (data) => apiFetch('/api/v1/venues/recommend', { method: 'POST', body: data });
