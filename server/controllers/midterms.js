import * as midtermsDb from '../db/queries/midterms.js';
import * as coursesDb from '../db/queries/courses.js';
import { campusStartOfToday } from '../lib/timezone.js';
import { checkAnyRsoBoard } from '../middleware/auth.js';
import { readPaging, PAGING_LIMITS } from '../lib/pagination.js';
import { recordDenial } from '../services/denialRecorder.js';
import * as outbox from '../db/queries/outbox.ts';

export async function getCourses(req, res, next) {
  try {
    const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.courses);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/midterms/courses',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    const courses = await coursesDb.getCourses({ limit, offset });
    res.json({ courses });
  } catch (err) { next(err); }
}

export async function listMidterms(req, res, next) {
  try {
    const { courseCode } = req.query;
    const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.midterms);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/midterms',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    // Hide midterms once the calendar day after they take place has begun. The
    // day that counts is the campus one, and end_time is campus wall clock, so
    // the comparison is between strings rather than through a Date, which would
    // read both of them in whatever zone this process runs in. The filter goes
    // to the database with the limit, because filtering here afterwards would
    // let the limit cut the page before the filter ran and hand the caller a
    // short page while the rows it wanted sat behind the cut.
    const midterms = await midtermsDb.getMidterms({
      courseCode: courseCode || null,
      endingOnOrAfter: campusStartOfToday(),
      limit, offset,
    });
    res.json({ midterms });
  } catch (err) { next(err); }
}

export async function createMidterm(req, res, next) {
  try {
    const { course_code, location_id, title, start_time, end_time } = req.body;
    if (!course_code || !location_id || !title || !start_time || !end_time) {
      return res.status(400).json({ error: 'course_code, location_id, title, start_time, end_time required' });
    }
    const result = await midtermsDb.createMidterm({
      course_code, submitted_by: req.user.net_id, location_id, title, start_time, end_time,
    });
    await outbox.recordMidtermChanged(result.insertId);
    res.status(201).json({ midterm_id: result.insertId });
  } catch (err) { next(err); }
}

export async function getConfirmedMidtermsHandler(req, res, next) {
  try {
    const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.confirmedMidterms);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/midterms',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    const midterms = await midtermsDb.getConfirmedMidterms({ limit, offset });
    res.json({ midterms });
  } catch (err) { next(err); }
}

export async function getAdminMidterms(req, res, next) {
  try {
    if (!req.user?.is_global_admin) return res.status(403).json({ error: 'Global admin required' });
    const midterms = await midtermsDb.getAllMidtermsAdmin();
    res.json({ midterms });
  } catch (err) { next(err); }
}

/**
 * Remove a midterm. Global admins, and anyone who sits on an RSO board.
 *
 * The listing is read by students planning around exam weeks, so an entry that
 * should not be there needs a way off the page rather than a status that keeps
 * it in the admin listing forever. The schedule belongs to no single RSO, so
 * there is no RSO to be on the board of for a given exam, and sitting on any
 * board is the bar. Boards are the people who schedule around this listing and
 * so the people who notice what is wrong with it. An ordinary member cannot,
 * and neither can an editor, whose remit is that RSO's own events.
 */
export async function deleteMidterm(req, res, next) {
  try {
    const permitted = req.user?.is_global_admin || await checkAnyRsoBoard(req.user.net_id);
    if (!permitted) return res.status(403).json({ error: 'Global admin or RSO board access required' });
    const midtermId = parseInt(req.params.id);
    if (isNaN(midtermId)) return res.status(400).json({ error: 'id must be an integer' });
    // Read before the delete, because afterwards there is nothing left to say
    // what went.
    const before = await outbox.midtermSnapshot(midtermId);
    const result = await midtermsDb.deleteMidterm(midtermId);
    if (!result.affectedRows) return res.status(404).json({ error: 'Midterm not found' });
    if (before) await outbox.recordMidtermDeleted(before);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

/**
 * How many entries one request may remove.
 *
 * The schedule is one page of every exam still to come, so a board clearing a
 * bad import is choosing from what is on that page. A list longer than the
 * listing itself is not a person choosing.
 */
const MAX_BULK_DELETE = 500;
const IDS_REFUSED =
  'ids must be a list of at least one and at most 500 whole numbers, separated by commas.';

/**
 * The entries a request named, as numbers, or null when the value is not that.
 *
 * An empty list is refused rather than read as "all of them", because a page
 * that lost track of what was ticked should not clear the schedule.
 *
 * @param {unknown} raw
 * @returns {number[]|null}
 */
function readMidtermIds(raw) {
  const parts = (Array.isArray(raw) ? raw : [raw])
    .filter(value => value !== undefined)
    .flatMap(value => (typeof value === 'string' ? value.split(',') : [value]))
    .map(value => String(value).trim())
    .filter(value => value !== '');
  if (parts.length === 0 || parts.length > MAX_BULK_DELETE) return null;
  const ids = parts.map(Number);
  if (ids.some(id => !Number.isInteger(id) || id < 1)) return null;
  return ids;
}

/**
 * Remove several entries from the schedule at once.
 *
 * Held to the bar a single removal is held to, because removing ten entries is
 * not a different power from removing one of them ten times.
 */
export async function deleteMidterms(req, res, next) {
  try {
    const permitted = req.user?.is_global_admin || await checkAnyRsoBoard(req.user.net_id);
    if (!permitted) return res.status(403).json({ error: 'Global admin or RSO board access required' });
    const ids = readMidtermIds(req.query.ids);
    if (ids === null) return res.status(400).json({ error: IDS_REFUSED });
    const result = await midtermsDb.deleteMidterms(ids);
    res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) { next(err); }
}

export async function updateMidtermStatus(req, res, next) {
  try {
    if (!req.user?.is_global_admin) return res.status(403).json({ error: 'Global admin required' });
    const midtermId = parseInt(req.params.id);
    if (isNaN(midtermId)) return res.status(400).json({ error: 'id must be an integer' });
    const { status } = req.body;
    if (!['Pending', 'Confirmed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ error: 'status must be Pending, Confirmed, or Cancelled' });
    }
    const before = await outbox.midtermSnapshot(midtermId);
    await midtermsDb.setMidtermStatus(midtermId, status);
    await outbox.recordMidtermChanged(midtermId, before);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
