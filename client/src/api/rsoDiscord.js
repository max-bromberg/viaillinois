import { apiFetch } from './base.js';

/**
 * The board's own Discord server.
 *
 * What the website answers is a mirror of what the bot last reported, because
 * the binding lives in the bot's database and the website has no account on
 * it. Disconnecting is decided by the website, which clears its mirror at once
 * and leaves the bot an instruction to clear the binding itself.
 */
export const getRsoDiscord = id => apiFetch(`/api/v1/rsos/${id}/discord`);

export const unbindRsoDiscord = (id, guildId) =>
  apiFetch(`/api/v1/rsos/${id}/discord/${guildId}`, { method: 'DELETE' });
