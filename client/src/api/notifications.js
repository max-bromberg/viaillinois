import { apiFetch } from './base.js';

/**
 * What the person signed in asked to be told about.
 *
 * Following an organization and asking for a reminder both belong to the
 * Discord bot, because the bot is what sends the message. What the website
 * holds is a mirror of what the bot reported, and a choice made here is
 * written to it and left for the bot to apply, so the page answers at once and
 * the message arrives when the bot next reads its instructions.
 */
export const getMyNotifications = () =>
  apiFetch('/api/v1/me/notifications', { silentAuth: true });

export const followOrganization = (rsoId, following) =>
  apiFetch(`/api/v1/me/notifications/organizations/${rsoId}`,
    { method: 'PUT', body: { following } });

export const remindAboutEvent = (eventId, wanted) =>
  apiFetch(`/api/v1/me/notifications/events/${eventId}`,
    { method: 'PUT', body: { wanted } });
