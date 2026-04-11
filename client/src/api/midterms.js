import { apiFetch } from './base.js';

export const getMidterms   = (cc)    => apiFetch(`/api/v1/midterms${cc ? `?courseCode=${cc}` : ''}`);
export const createMidterm = (data)  => apiFetch('/api/v1/midterms', { method: 'POST', body: data });
export const voteMidterm   = (id, v) => apiFetch(`/api/v1/midterms/${id}/vote`, { method: 'POST', body: { value: v } });
