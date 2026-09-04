import { eq } from 'drizzle-orm';
import db from '../client.ts';
import { discordLinks, users } from '../schema/schema.ts';

/**
 * Who a Discord account is.
 *
 * Joined to Users so the answer carries the global administrator flag, which
 * is what the acting middleware needs to build the same req.user the cookie
 * builds, in one query.
 *
 * @returns The link with the flag, or null when nobody linked that account.
 */
export async function getLinkByDiscordUserId(discordUserId: string) {
  const rows = await db
    .select({
      discordUserId: discordLinks.discordUserId,
      netId:         discordLinks.netId,
      linkedAt:      discordLinks.linkedAt,
      isGlobalAdmin: users.isGlobalAdmin,
    })
    .from(discordLinks)
    .innerJoin(users, eq(users.netId, discordLinks.netId))
    .where(eq(discordLinks.discordUserId, discordUserId))
    .limit(1);
  return rows[0] ?? null;
}
