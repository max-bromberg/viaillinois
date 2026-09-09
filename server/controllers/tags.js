import * as tagsDb from '../db/queries/tags.js';

/**
 * The tag list.
 *
 * Reading it is open, because the filter panel on the events feed is open.
 * Changing it is a global admin's: the list is one shared vocabulary rather
 * than one organization's, and every tag on it appears in the filter panel of
 * every reader on the site.
 */

/** The column holds fifty characters. */
const MAX_LENGTH = 50;

/**
 * A tag name as it will be stored, or a sentence saying why it cannot be.
 *
 * A comma is refused because the feed joins an event's tags into one string
 * separated by commas and the event form splits them apart again on the same
 * character, so a tag with a comma in it would come back as two tags that do
 * not exist.
 *
 * @param {unknown} raw
 * @returns {{ name: string } | { error: string }}
 */
function readTagName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name === '') return { error: 'A tag needs a name.' };
  if (name.length > MAX_LENGTH) return { error: `A tag name can be at most ${MAX_LENGTH} characters.` };
  if (name.includes(',')) return { error: 'A tag name cannot contain a comma.' };
  return { name };
}

export async function listTags(req, res, next) {
  try {
    res.json({ tags: await tagsDb.allTags() });
  } catch (err) { next(err); }
}

export async function createTag(req, res, next) {
  try {
    if (!req.user?.is_global_admin) return res.status(403).json({ error: 'Global admin required' });
    const read = readTagName(req.body?.tag_name);
    if (read.error) return res.status(400).json({ error: read.error });
    const { created } = await tagsDb.createTag(read.name);
    if (!created) return res.status(409).json({ error: 'That tag is already on the list.' });
    res.status(201).json({ tag_name: read.name });
  } catch (err) { next(err); }
}

export async function deleteTag(req, res, next) {
  try {
    if (!req.user?.is_global_admin) return res.status(403).json({ error: 'Global admin required' });
    const read = readTagName(req.params.name);
    if (read.error) return res.status(400).json({ error: read.error });
    const { affectedRows } = await tagsDb.deleteTag(read.name);
    if (!affectedRows) return res.status(404).json({ error: 'Tag not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
