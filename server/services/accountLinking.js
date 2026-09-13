import { clearFacts } from './linkedRoles.js';
import { recordLinkRevoked } from '../db/queries/outbox.ts';
import {
  getLinkByDiscordUserId, getLinkByNetId, deleteLinkByDiscordUserId, deleteLinkByNetId,
} from '../db/queries/discordLinks.ts';

/**
 * Taking a link back, from either side of it.
 *
 * A person can unlink from Discord, where the bot asks the internal service
 * API, or from the account page on the website. Both do the same three things
 * in the same order, which is why they are written once here rather than twice
 * in the two routes.
 *
 * The order matters. The facts on Discord are cleared first, because the
 * sealed authorization that authorizes the change lives in the row that is
 * about to be deleted. The clearing is best effort: somebody who asked to
 * unlink is unlinked whatever Discord answers, and a role that lingers on one
 * server is a smaller problem than a refusal to unlink.
 */

async function clearQuietly(netId) {
  try {
    await clearFacts(netId);
  } catch (err) {
    console.error(`clearing the linked role facts for ${netId} failed:`, err.message);
  }
}

/**
 * @param {string} discordUserId
 * @returns {Promise<{ discordUserId: string, netId: string }|null>} what was
 *   removed, or null when that account was not linked
 */
export async function unlinkByDiscordUserId(discordUserId) {
  const link = await getLinkByDiscordUserId(discordUserId);
  if (link) await clearQuietly(link.netId);
  const removed = await deleteLinkByDiscordUserId(discordUserId);
  if (!removed) return null;
  await recordLinkRevoked(removed);
  return removed;
}

/**
 * @param {string} netId
 * @returns {Promise<{ discordUserId: string, netId: string }|null>}
 */
export async function unlinkByNetId(netId) {
  const link = await getLinkByNetId(netId);
  if (!link) return null;
  await clearQuietly(netId);
  const removed = await deleteLinkByNetId(netId);
  if (!removed) return null;
  await recordLinkRevoked(removed);
  return removed;
}
