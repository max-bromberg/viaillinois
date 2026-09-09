import { asc, count, eq } from 'drizzle-orm';
import { db } from '../client.ts';
import { tags, eventTags } from '../schema/schema.ts';

/**
 * The tag list.
 *
 * The eight tags a board could put on an event were written into the event form
 * and into the filter panel, so adding one meant a release. The table has held
 * them all along, filled in as a side effect of saving an event, and this is
 * what makes it the list rather than a record of what has been used.
 *
 * Written with Drizzle, which is the direction the data layer is moving in.
 */

/**
 * Every tag, with how many events carry it.
 *
 * The count is here rather than worked out afterwards because removing a tag
 * takes it off every event that has it, and an admin about to do that should be
 * told how many that is before they do.
 *
 * @returns {Promise<Array<{ tag_name: string, events: number }>>}
 */
export async function allTags() {
  return db
    .select({ tag_name: tags.tagName, events: count(eventTags.eventId) })
    .from(tags)
    .leftJoin(eventTags, eq(tags.tagName, eventTags.tagName))
    .groupBy(tags.tagName)
    .orderBy(asc(tags.tagName));
}

/** MySQL's code for a row that is already there. */
const ALREADY_THERE = 'ER_DUP_ENTRY';

/**
 * Add a tag to the list.
 *
 * A tag that is already there is reported rather than treated as an error,
 * because two admins adding the same tag is not a failure of anything. The
 * duplicate is caught rather than looked for first, so that two requests
 * arriving together cannot both find nothing and both insert.
 *
 * @param {string} tagName
 * @returns {Promise<{ created: boolean }>}
 */
export async function createTag(tagName) {
  try {
    await db.insert(tags).values({ tagName });
    return { created: true };
  } catch (err) {
    if (err?.code === ALREADY_THERE || err?.cause?.code === ALREADY_THERE) return { created: false };
    throw err;
  }
}

/**
 * Take a tag off the list.
 *
 * Event_Tags points at this table and cascades, so this also takes the tag off
 * every event carrying it. That is what removing a tag means, and it is why
 * allTags reports the count.
 *
 * @param {string} tagName
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function deleteTag(tagName) {
  const [result] = await db.delete(tags).where(eq(tags.tagName, tagName));
  return { affectedRows: result.affectedRows };
}
