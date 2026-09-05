import { apiFetch } from './base.js';

/**
 * The state of one link session, which is all the link page needs before it
 * decides whether to offer the button. The answer never says which Discord
 * account opened the session.
 */
export const getLinkSession = (session) =>
  apiFetch(`/api/v1/link/discord/${encodeURIComponent(session)}`, { silentAuth: true });
