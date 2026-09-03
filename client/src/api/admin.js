import { apiFetch } from './base.js';

export const getAdminUsers      = ()           => apiFetch('/api/v1/admin/users');
export const createAdminUser    = (d)          => apiFetch('/api/v1/admin/users',               { method: 'POST',   body: d });
export const updateAdminUser    = (netId, d)   => apiFetch(`/api/v1/admin/users/${netId}`,      { method: 'PUT',    body: d });
export const resetAdminPassword = (netId, d)   => apiFetch(`/api/v1/admin/users/${netId}/password`, { method: 'PUT', body: d });
export const deleteAdminUser    = (netId)      => apiFetch(`/api/v1/admin/users/${netId}`,      { method: 'DELETE' });

export const getPollStatus      = ()           => apiFetch('/api/v1/admin/poll-status');
export const getPollHistory     = (service)    => apiFetch(`/api/v1/admin/poll-history/${service}`);
export const getUnknownCodes    = ()           => apiFetch('/api/v1/admin/poll-unknown-codes');
export const triggerPoll        = (service)    => apiFetch(`/api/v1/admin/poll-trigger/${service}`, { method: 'POST' });

export const getDenials         = (days = 7)   => apiFetch(`/api/v1/admin/denials?days=${days}`);
