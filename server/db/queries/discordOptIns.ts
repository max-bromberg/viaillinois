import { and, eq } from 'drizzle-orm';
import db from '../client.ts';
import { discordRsoFollows, discordEventReminders } from '../schema/schema.ts';

/**
 * What a linked person asked to be told about, as the website holds it.
 *
 * A mirror rather than the record. Subscriptions and Reminders in via_bot are
 * what the bot reads when it decides who to write to, because the bot is what
 * sends the messages, and the website has no account on that database. These
 * rows exist so the website can offer the same two choices from the pages
 * somebody is already reading, and show what they chose before.
 *
 * A choice made on the website is written here and to the outbox in the same
 * breath: here so the page answers at once, and there so the bot applies it
 * where it lives. A report from the bot afterwards writes the same rows again,
 * which is why every write here is safe to repeat.
 */

/** The organizations one Discord account follows. */
export async function getFollowsFor(discordUserId: string) {
  return db
    .select({ rso_id: discordRsoFollows.rsoId })
    .from(discordRsoFollows)
    .where(eq(discordRsoFollows.discordUserId, discordUserId));
}

/** The events one Discord account asked to be reminded about. */
export async function getRemindersFor(discordUserId: string) {
  return db
    .select({ event_id: discordEventReminders.eventId })
    .from(discordEventReminders)
    .where(eq(discordEventReminders.discordUserId, discordUserId));
}

/**
 * Follow an organization, or stop.
 *
 * Both directions are safe to repeat, because the same choice can arrive twice:
 * once from the person pressing the control and again from the bot reporting
 * what it has.
 */
export async function setFollow(
  { discordUserId, rsoId, following }:
  { discordUserId: string, rsoId: number, following: boolean },
) {
  if (!following) {
    await db.delete(discordRsoFollows).where(and(
      eq(discordRsoFollows.discordUserId, discordUserId),
      eq(discordRsoFollows.rsoId, rsoId),
    ));
    return;
  }
  await db.insert(discordRsoFollows)
    .values({ discordUserId, rsoId })
    // Following something already followed is not a second row and not an
    // error. The row is the whole key, so there is nothing to change.
    .onDuplicateKeyUpdate({ set: { rsoId } });
}

/** Ask for a reminder about one event, or withdraw the ask. */
export async function setReminder(
  { discordUserId, eventId, wanted }:
  { discordUserId: string, eventId: number, wanted: boolean },
) {
  if (!wanted) {
    await db.delete(discordEventReminders).where(and(
      eq(discordEventReminders.discordUserId, discordUserId),
      eq(discordEventReminders.eventId, eventId),
    ));
    return;
  }
  await db.insert(discordEventReminders)
    .values({ discordUserId, eventId })
    .onDuplicateKeyUpdate({ set: { eventId } });
}

/** Whether this account follows this organization, which one page asks about one. */
export async function isFollowing(discordUserId: string, rsoId: number) {
  const rows = await db.select({ rso_id: discordRsoFollows.rsoId })
    .from(discordRsoFollows)
    .where(and(
      eq(discordRsoFollows.discordUserId, discordUserId),
      eq(discordRsoFollows.rsoId, rsoId),
    ));
  return rows.length > 0;
}

/** Whether this account asked to be reminded about this event. */
export async function hasReminder(discordUserId: string, eventId: number) {
  const rows = await db.select({ event_id: discordEventReminders.eventId })
    .from(discordEventReminders)
    .where(and(
      eq(discordEventReminders.discordUserId, discordUserId),
      eq(discordEventReminders.eventId, eventId),
    ));
  return rows.length > 0;
}

/**
 * Replace everything the website holds for one Discord account with what the
 * bot says it has.
 *
 * The same two choices can be made inside Discord, with the follow command and
 * the reminder button on an event card, so the website's mirror would drift if
 * it only ever wrote what was chosen here. The bot reports the whole of what it
 * holds for one person and this writes exactly that, which is why it deletes
 * first: a report that leaves something out is the bot saying it is no longer
 * followed, and a merge would keep it for ever.
 *
 * In one transaction, so that a person is never seen having followed nothing
 * between the delete and the insert.
 */
export async function replaceOptInsFor(
  { discordUserId, following, reminders }:
  { discordUserId: string, following: number[], reminders: number[] },
) {
  await db.transaction(async (tx) => {
    await tx.delete(discordRsoFollows)
      .where(eq(discordRsoFollows.discordUserId, discordUserId));
    await tx.delete(discordEventReminders)
      .where(eq(discordEventReminders.discordUserId, discordUserId));

    if (following.length) {
      await tx.insert(discordRsoFollows)
        .values(following.map(rsoId => ({ discordUserId, rsoId })));
    }
    if (reminders.length) {
      await tx.insert(discordEventReminders)
        .values(reminders.map(eventId => ({ discordUserId, eventId })));
    }
  });
}
