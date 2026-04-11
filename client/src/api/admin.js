import { apiFetch } from './base.js';

export const getAdminUsers     = ()           => apiFetch('/api/v1/admin/users');
export const createAdminUser   = (d)          => apiFetch('/api/v1/admin/users',               { method: 'POST',   body: d });
export const updateAdminUser   = (netId, d)   => apiFetch(`/api/v1/admin/users/${netId}`,      { method: 'PUT',    body: d });
export const resetAdminPassword= (netId, d)   => apiFetch(`/api/v1/admin/users/${netId}/password`, { method: 'PUT', body: d });
export const deleteAdminUser   = (netId)      => apiFetch(`/api/v1/admin/users/${netId}`,      { method: 'DELETE' });
