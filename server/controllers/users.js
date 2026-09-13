import { getUserByNetId } from '../db/queries/users.js';
import { getUserMemberships } from '../db/queries/rso.js';
import { getLinkByNetId } from '../db/queries/discordLinks.ts';
import { unlinkByNetId } from '../services/accountLinking.js';

/**
 * Whether this person has a Discord account linked.
 *
 * The account area shows the state, offers to undo it, and offers the optional
 * linked roles step to somebody who did not take it, and that is all it needs,
 * so the Discord identifier itself is deliberately left out of the answer: the
 * person already knows which account it is, and the browser has no use for the
 * identifier.
 *
 * A failure to read the link is not a failure to answer who somebody is. The
 * account page is where a board member goes to work, and it should not stop
 * loading because the Discord part of it could not be read.
 */
async function discordState(netId) {
  try {
    const link = await getLinkByNetId(netId);
    return {
      linked: Boolean(link),
      linked_at: link?.linkedAt ?? null,
      // Whether the optional linked roles step was taken, which the account
      // page needs so that it can offer to take it now. What is held is a
      // sealed Discord authorization, and the browser is told only that one
      // exists, never what it is.
      roles_published: Boolean(link?.authorization),
    };
  } catch (err) {
    console.error(`reading the Discord link for ${netId} failed:`, err.message);
    return { linked: false, linked_at: null, roles_published: false };
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await getUserByNetId(req.user.net_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const memberships = await getUserMemberships(req.user.net_id);
    const discord = await discordState(req.user.net_id);
    res.json({ user: { ...user, memberships, discord } });
  } catch (err) { next(err); }
}

/**
 * Undo the link from the website.
 *
 * The same three things happen as when the bot is asked to unlink, in the same
 * order, because they are written once in the linking service.
 */
export async function unlinkDiscord(req, res, next) {
  try {
    const removed = await unlinkByNetId(req.user.net_id);
    if (!removed) {
      return res.status(404).json({ error: 'There is no Discord account linked to your VIA account.' });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
}
