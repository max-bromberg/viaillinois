import { apiFetch } from './base.js';

export const getMidterms            = (cc)         => apiFetch(`/api/v1/midterms${cc ? `?courseCode=${cc}` : ''}`);
export const getCourses             = ()           => apiFetch('/api/v1/midterms/courses');
export const createMidterm          = (data)        => apiFetch('/api/v1/midterms', { method: 'POST', body: data });
export const voteMidterm            = (id, v)       => apiFetch(`/api/v1/midterms/${id}/vote`, { method: 'POST', body: { value: v } });
export const getConfirmedMidterms   = ()            => apiFetch('/api/v1/midterms/confirmed');
export const getAdminMidterms       = ()            => apiFetch('/api/v1/midterms/admin');
export const updateMidtermStatus    = (id, status)  => apiFetch(`/api/v1/midterms/${id}/status`, { method: 'PATCH', body: { status } });
