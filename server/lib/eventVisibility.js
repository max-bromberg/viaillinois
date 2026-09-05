import { getUserMemberships } from '../db/queries/rso.js';

/**
 * Whether the acting person, if there is one, may be shown an event.
 *
 * An internal event belongs to one organization and is shown to that
 * organization. This is the rule the feed applies and the rule the reading
 * endpoints apply, and it is written once here so that the endpoints that act
 * on an event apply exactly the same one. An acting endpoint that skipped it
 * would let somebody outside an organization learn that an internal event
 * exists, and be counted at a meeting they were never shown.
 *
 * @param {{ user?: { net_id: string, is_global_admin?: boolean }|null }} req
 * @param {{ is_private?: unknown, rso_id: number }} event
 * @returns {Promise<boolean>}
 */
export async function maySeeEvent(req, event) {
  if (!event.is_private) return true;
  if (!req.user) return false;
  if (req.user.is_global_admin) return true;
  const memberships = await getUserMemberships(req.user.net_id);
  return memberships.some(membership => membership.rso_id === event.rso_id);
}
