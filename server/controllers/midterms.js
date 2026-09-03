import * as midtermsDb from '../db/queries/midterms.js';
import * as coursesDb from '../db/queries/courses.js';
import { campusStartOfToday } from '../lib/timezone.js';
import { checkAnyRsoBoard } from '../middleware/auth.js';
import { readPaging, PAGING_LIMITS } from '../lib/pagination.js';
import { recordDenial } from '../services/denialRecorder.js';

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
    const result = await midtermsDb.deleteMidterm(midtermId);
    if (!result.affectedRows) return res.status(404).json({ error: 'Midterm not found' });
    res.json({ ok: true });
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
    await midtermsDb.setMidtermStatus(midtermId, status);
    res.json({ ok: true });
  } catch (err) { next(err); }
}
