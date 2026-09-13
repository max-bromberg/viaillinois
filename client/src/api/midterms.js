import { apiFetch } from './base.js';

export const getMidterms            = (cc)         => apiFetch(`/api/v1/midterms${cc ? `?courseCode=${cc}` : ''}`);
export const getCourses             = ()           => apiFetch('/api/v1/midterms/courses');
export const createMidterm          = (data)        => apiFetch('/api/v1/midterms', { method: 'POST', body: data });
export const getConfirmedMidterms   = ()            => apiFetch('/api/v1/midterms/confirmed');
export const getAdminMidterms       = ()            => apiFetch('/api/v1/midterms/admin');
export const updateMidtermStatus    = (id, status)  => apiFetch(`/api/v1/midterms/${id}/status`, { method: 'PATCH', body: { status } });
export const deleteMidterm          = (id)          => apiFetch(`/api/v1/midterms/${id}`, { method: 'DELETE' });

/**
 * Remove several entries at once.
 *
 * @param {number[]} ids the entries chosen on the schedule
 */
export const deleteMidterms         = (ids)         => apiFetch(`/api/v1/midterms?ids=${ids.join(',')}`, { method: 'DELETE' });
