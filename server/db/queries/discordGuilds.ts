import { eq } from 'drizzle-orm';
import db from '../client.ts';
import { rsoDiscordGuilds } from '../schema/schema.ts';

/**
 * The mirror of which Discord server an organization's board has bound the bot
 * to.
 *
 * The binding belongs to the bot. It is a fact about a Discord server, the bot
 * is what is installed there, and Guild_Installations in via_bot is the record
 * of it. The website has no account on that database and is not meant to have
 * one, so the bot reports each binding through the internal service API and
 * this is where the report lands. Nothing is authorized from these rows:
 * unlinking is authorized by the same requireRSOAdmin the rest of the
 * dashboard uses, and the bot is what applies it.
 *
 * A Discord identifier is a decimal string that does not survive being read as
 * a number, so it is passed and stored as text everywhere, as it is for
 * Discord_Links.
 */

export type ReportedBinding = {
  guildId: string,
  rsoId: number,
  guildName?: string | null,
  boundBy?: string | null,
  boundAt?: string | null,
};

/**
 * Record what the bot says about one server.
 *
 * The bot reports what it has rather than what changed, so the same binding
 * arrives again whenever it re-reports and a server that moved to another
 * organization arrives naming the new one. Both are the same write: the server
 * is the key, so a second report replaces the first rather than adding a
 * second server, and a move leaves nothing behind on the organization the
 * server used to belong to.
 */
export async function reportBinding(
  { guildId, rsoId, guildName, boundBy, boundAt }: ReportedBinding,
) {
  const values = {
    guildId,
    rsoId,
    guildName: guildName ?? '',
    boundBy: boundBy ?? null,
    boundAt: boundAt ?? null,
  };
  await db.insert(rsoDiscordGuilds).values(values).onDuplicateKeyUpdate({
    set: {
      rsoId: values.rsoId,
      guildName: values.guildName,
      boundBy: values.boundBy,
      boundAt: values.boundAt,
    },
  });
}

/**
 * Forget a server, because the bot says it is no longer bound or is no longer
 * there at all. A server that was already forgotten is not an error: the bot
 * may report the same removal twice, and the answer both times is that there
 * is nothing bound.
 */
export async function forgetBinding(guildId: string) {
  await db.delete(rsoDiscordGuilds).where(eq(rsoDiscordGuilds.guildId, guildId));
}

/**
 * Every server bound to one organization, as the dashboard lists them.
 *
 * An organization can run more than one, a general server and a project server
 * among them, so this is a list rather than one row. The column names are the
 * ones the rest of the API answers in, so that the route above this does not
 * have to rename anything.
 */
export async function getGuildsForRso(rsoId: number) {
  return db
    .select({
      guild_id: rsoDiscordGuilds.guildId,
      guild_name: rsoDiscordGuilds.guildName,
      bound_by: rsoDiscordGuilds.boundBy,
      bound_at: rsoDiscordGuilds.boundAt,
      reported_at: rsoDiscordGuilds.reportedAt,
    })
    .from(rsoDiscordGuilds)
    .where(eq(rsoDiscordGuilds.rsoId, rsoId))
    .orderBy(rsoDiscordGuilds.guildName);
}

/** One server, so that a route can check it is bound to the organization it names. */
export async function getBinding(guildId: string) {
  const rows = await db
    .select({
      guild_id: rsoDiscordGuilds.guildId,
      rso_id: rsoDiscordGuilds.rsoId,
      guild_name: rsoDiscordGuilds.guildName,
    })
    .from(rsoDiscordGuilds)
    .where(eq(rsoDiscordGuilds.guildId, guildId));
  return rows[0] ?? null;
}
