import { apiFetch } from './base.js';
export const getMe = () => apiFetch('/api/v1/users/me', { silentAuth: true });
export const unlinkDiscord = () => apiFetch('/api/v1/users/me/discord', { method: 'DELETE' });
