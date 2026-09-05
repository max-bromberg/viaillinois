import { randomBytes } from 'node:crypto';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import db from '../client.ts';
import { discordLinks, linkSessions, rsOs, rsoMemberships, users } from '../schema/schema.ts';
import { campusNow } from '../../lib/timezone.js';

/**
 * The link between a Discord account and a NetID, and the short lived session
 * that makes one.
 *
 * Two rules run through everything here. One person has one Discord account
 * and one Discord account belongs to one person, so writing a link removes
 * whatever stood on either side of it first, in one transaction, rather than
 * leaving the unique keys to refuse. And a Discord identifier is a decimal
 * string that does not survive being read as a number, so it is passed and
 * stored as text everywhere.
 */

/** How long a person has to open the address the bot sent them. */
export const SESSION_MINUTES = 10;

/** A session identifier: thirty two random bytes, written URL safe, which is 43 characters. */
function newSessionId() {
  return randomBytes(32).toString('base64url');
}

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

/**
 * The link a person holds, with the sealed Discord authorization if there is
 * one. This is what the linked roles service reads before it refreshes.
 */
export async function getLinkByNetId(netId: string) {
  const rows = await db
    .select({
      discordUserId: discordLinks.discordUserId,
      netId:         discordLinks.netId,
      linkedAt:      discordLinks.linkedAt,
      // Read through a raw expression rather than the column, because the
      // column maps varbinary to text on the way out and a sealed value is
      // arbitrary bytes that no text decoding survives.
      authorization: sql<Buffer | null>`${discordLinks.discordAuthorization}`,
    })
    .from(discordLinks)
    .where(eq(discordLinks.netId, netId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The whole answer to "who is this Discord account", memberships included.
 *
 * The bot asks this on every interaction it cannot answer from its cache, so
 * the memberships travel with the person rather than costing a second request.
 */
export async function getLinkWithMemberships(discordUserId: string) {
  const rows = await db
    .select({
      discord_user_id: discordLinks.discordUserId,
      net_id:          discordLinks.netId,
      display_name:    users.fullName,
      is_global_admin: users.isGlobalAdmin,
      linked_at:       discordLinks.linkedAt,
    })
    .from(discordLinks)
    .innerJoin(users, eq(users.netId, discordLinks.netId))
    .where(eq(discordLinks.discordUserId, discordUserId))
    .limit(1);
  const link = rows[0];
  if (!link) return null;

  const memberships = await db
    .select({
      rso_id:   rsoMemberships.rsoId,
      rso_name: rsOs.name,
      role:     rsoMemberships.role,
    })
    .from(rsoMemberships)
    .innerJoin(rsOs, eq(rsOs.rsoId, rsoMemberships.rsoId))
    .where(eq(rsoMemberships.netId, link.net_id))
    .orderBy(asc(rsoMemberships.rsoId));

  return {
    ...link,
    display_name: link.display_name ?? null,
    is_global_admin: Boolean(link.is_global_admin),
    memberships,
  };
}

/**
 * Open the handshake the bot sends somebody into.
 *
 * An open session for the same Discord account is replaced rather than added
 * to, so that a person who runs the link command twice has one live address
 * and the older one stops working. A session that was already completed stays
 * where it is, because it is the record that the link was made.
 *
 * @returns the identifier and the campus wall clock expiry
 */
export async function openLinkSession(
  { discordUserId, minutes = SESSION_MINUTES }: { discordUserId: string, minutes?: number },
) {
  const sessionId = newSessionId();
  const expiresAt = campusNow(new Date(Date.now() + minutes * 60_000));
  await db.transaction(async tx => {
    await tx.delete(linkSessions).where(and(
      eq(linkSessions.discordUserId, discordUserId),
      isNull(linkSessions.completedAt),
    ));
    // Both times come from one clock, ours, because the column default is the
    // database's clock and the database is not necessarily on campus time.
    await tx.insert(linkSessions).values({
      sessionId, discordUserId, createdAt: campusNow(), expiresAt,
    });
  });
  return { sessionId, expiresAt };
}

/** One session, or null when the identifier names nothing. */
export async function getLinkSession(sessionId: string) {
  const rows = await db
    .select({
      sessionId:     linkSessions.sessionId,
      discordUserId: linkSessions.discordUserId,
      createdAt:     linkSessions.createdAt,
      expiresAt:     linkSessions.expiresAt,
      completedAt:   linkSessions.completedAt,
    })
    .from(linkSessions)
    .where(eq(linkSessions.sessionId, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

/** Mark a session as the one that made a link. */
export async function completeLinkSession(sessionId: string) {
  await db
    .update(linkSessions)
    .set({ completedAt: campusNow() })
    .where(eq(linkSessions.sessionId, sessionId));
}

/**
 * Write the link, replacing whatever stood on either side of it.
 *
 * Somebody who linked a second Discord account meant to move, and somebody
 * whose Discord account was linked to another NetID has just proved they hold
 * the account. Both are one transaction, so there is never a moment where a
 * person has no link because the old one was removed and the new one has not
 * arrived.
 *
 * What it displaced is answered rather than dropped, because the Discord bot
 * holds a link of its own and has to be told that one it holds is gone. Told
 * nothing, it goes on acting for the person the displaced Discord account used
 * to be.
 *
 * @param authorization the sealed Discord refresh token, when the person
 *   accepted the linked roles step
 * @returns the links this one displaced, which is at most one on each side and
 *   never the link being written
 */
export async function linkAccount(
  { discordUserId, netId, authorization = null }:
  { discordUserId: string, netId: string, authorization?: Buffer | null },
) {
  return db.transaction(async tx => {
    const standing = await tx
      .select({ discordUserId: discordLinks.discordUserId, netId: discordLinks.netId })
      .from(discordLinks)
      .where(or(
        eq(discordLinks.discordUserId, discordUserId),
        eq(discordLinks.netId, netId),
      ));

    await tx.delete(discordLinks).where(eq(discordLinks.discordUserId, discordUserId));
    await tx.delete(discordLinks).where(eq(discordLinks.netId, netId));
    await tx.insert(discordLinks).values({
      discordUserId,
      netId,
      linkedAt: campusNow(),
      discordAuthorization: authorization,
    });

    // Linking the same two accounts again displaces nothing, because what it
    // replaced was the same statement it is making.
    return standing.filter(link =>
      !(link.discordUserId === discordUserId && link.netId === netId));
  });
}

/** Replace the sealed authorization on an existing link. */
export async function setLinkAuthorization(netId: string, authorization: Buffer | null) {
  await db
    .update(discordLinks)
    .set({ discordAuthorization: authorization })
    .where(eq(discordLinks.netId, netId));
}

/**
 * Remove a link, and say what was removed, because the outbox entry and the
 * facts to clear on Discord both need the other side of it.
 */
export async function deleteLinkByDiscordUserId(discordUserId: string) {
  const existing = await getLinkByDiscordUserId(discordUserId);
  if (!existing) return null;
  await db.delete(discordLinks).where(eq(discordLinks.discordUserId, discordUserId));
  return { discordUserId: existing.discordUserId, netId: existing.netId };
}

/** The same, from the account page, where the person is known by NetID. */
export async function deleteLinkByNetId(netId: string) {
  const existing = await getLinkByNetId(netId);
  if (!existing) return null;
  await db.delete(discordLinks).where(eq(discordLinks.netId, netId));
  return { discordUserId: existing.discordUserId, netId: existing.netId };
}

/** How long a session is kept after it has run out, so a support question can still be answered. */
export const SESSION_GRACE_DAYS = 1;

/**
 * Remove the sessions that are done with.
 *
 * A session lasts ten minutes and is then finished, whether it was used or
 * abandoned, but every row holds a Discord identifier and the time somebody
 * asked to link. Left alone the table becomes a list of exactly that, growing
 * for ever and answering a question nobody needs answered. A day of grace past
 * the expiry is kept so that a person asking why their link did not work can
 * still be told.
 *
 * @returns the number of rows removed
 */
export async function pruneLinkSessions(graceDays: number = SESSION_GRACE_DAYS) {
  // Written into the statement rather than bound, because it is an interval
  // rather than a value, and forced to a whole number first so that nothing
  // else can reach the statement.
  const days = Math.max(1, Math.floor(Number(graceDays) || 0));
  const [result] = await db
    .delete(linkSessions)
    .where(lt(linkSessions.expiresAt, sql`DATE_SUB(NOW(), INTERVAL ${sql.raw(String(days))} DAY)`));
  return result.affectedRows;
}
