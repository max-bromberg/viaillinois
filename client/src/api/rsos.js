import { apiFetch } from './base.js';

export const getRsos      = ()        => apiFetch('/api/v1/rsos');
export const getRso       = (id)      => apiFetch(`/api/v1/rsos/${id}`);
export const getRsoStats  = (id)      => apiFetch(`/api/v1/rsos/${id}/stats`);
export const createRso    = (d)       => apiFetch('/api/v1/rsos',               { method: 'POST',   body: d });
export const updateRso    = (id, d)   => apiFetch(`/api/v1/rsos/${id}`,         { method: 'PUT',    body: d });
export const addMember    = (id, d)   => apiFetch(`/api/v1/rsos/${id}/members`, { method: 'POST',   body: d });
export const removeMember = (id, nid) => apiFetch(`/api/v1/rsos/${id}/members/${nid}`, { method: 'DELETE' });
export const deleteRso    = (id)      => apiFetch(`/api/v1/rsos/${id}`,               { method: 'DELETE' });
