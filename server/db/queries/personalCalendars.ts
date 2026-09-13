import { eq } from 'drizzle-orm';
import db from '../client.ts';
import { personalCalendars } from '../schema/schema.ts';
import { campusNow } from '../../lib/timezone.js';

/**
 * The calendar subscription a person holds, and the RSOs it follows.
 *
 * The address is the whole of the credential, because a calendar application
 * fetches it on a schedule with nothing to sign in with, so the token itself is
 * never stored: the row holds its hash, the address is shown once when it is
 * made, and asking for a new one replaces the hash and leaves every copy of the
 * old address answering nothing. One row per person, so there is one address to
 * throw away rather than a collection nobody can count.
 */

/** What the RSO set means: a list of identifiers, or null for every RSO. */
export type RsoSet = number[] | null;

/**
 * A JSON column as a value, whichever way the driver handed it back. MySQL
 * parses the column for the caller and MariaDB, where the tests run, hands
 * back the text it stored.
 */
function readRsoIds(value: unknown): RsoSet {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
}

/**
 * Make the person's calendar, or make them a new one.
 *
 * The same call does both, because rotating is making one and forgetting the
 * one before it, and there is only ever one row to hold either.
 */
export async function rotateCalendar(
  { netId, tokenHash, rsoIds }: { netId: string, tokenHash: string, rsoIds: RsoSet },
) {
  const rotatedAt = campusNow();
  await db
    .insert(personalCalendars)
    .values({ netId, tokenHash, rsoIds, rotatedAt })
    .onDuplicateKeyUpdate({ set: { tokenHash, rsoIds, rotatedAt } });
  return { rotatedAt };
}

/**
 * Follow a different set of RSOs, keeping the address the person has already
 * given to their phone.
 *
 * @returns how many rows changed, which is zero when there is no calendar yet
 */
export async function setCalendarRsos({ netId, rsoIds }: { netId: string, rsoIds: RsoSet }) {
  const [result] = await db
    .update(personalCalendars)
    .set({ rsoIds })
    .where(eq(personalCalendars.netId, netId));
  return result.affectedRows;
}

/** Whose calendar an address is, or null when it is nobody's any more. */
export async function getCalendarByTokenHash(tokenHash: string) {
  const rows = await db
    .select({
      netId:  personalCalendars.netId,
      rsoIds: personalCalendars.rsoIds,
    })
    .from(personalCalendars)
    .where(eq(personalCalendars.tokenHash, tokenHash))
    .limit(1);
  return rows[0] ? { netId: rows[0].netId, rsoIds: readRsoIds(rows[0].rsoIds) } : null;
}
