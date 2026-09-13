import * as reportsDb from '../db/queries/bugReports.js';

/**
 * Bug reports.
 *
 * Reporting is open, because a student should not have to sign in to say that a
 * page is broken, and it is bounded per address in the route table for the same
 * reason that anything open is. Reading them is a global admin's: a report can
 * name the person who sent it and can carry an address to write back to.
 */

/**
 * The parts of VIA a report can be about.
 *
 * A fixed list rather than free text, because the first thing an admin wants to
 * know is which surface is broken, and a hundred different spellings of the
 * calendar answers that question worse than five choices do.
 */
export const AREAS = ['Events', 'Calendar', 'Midterms', 'Dashboard', 'Scheduler', 'Something else'];

const MAX_SUMMARY = 200;
const MAX_DETAIL = 4000;
const MAX_CONTACT = 255;
const MAX_PAGE = 500;

/** Trimmed text, or nothing at all when what was given is only spaces. */
function trimmed(raw, limit) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text === '' ? null : text.slice(0, limit);
}

export async function createBugReport(req, res, next) {
  try {
    const { area, summary, detail, contact, page } = req.body ?? {};
    if (!AREAS.includes(area)) {
      return res.status(400).json({ error: `area must be one of: ${AREAS.join(', ')}` });
    }
    const written = trimmed(summary, MAX_SUMMARY + 1);
    if (!written) return res.status(400).json({ error: 'A report needs a short summary of what went wrong.' });
    if (written.length > MAX_SUMMARY) {
      return res.status(400).json({ error: `The summary can be at most ${MAX_SUMMARY} characters. Put the rest in the details.` });
    }
    const { insertId } = await reportsDb.createBugReport({
      // Nobody has to sign in to say that a page is broken, and no address of
      // any kind is recorded here or anywhere else on the platform.
      reported_by: req.user?.net_id ?? null,
      area,
      summary: written,
      detail: trimmed(detail, MAX_DETAIL),
      contact: trimmed(contact, MAX_CONTACT),
      page: trimmed(page, MAX_PAGE),
    });
    res.status(201).json({ report_id: insertId });
  } catch (err) { next(err); }
}

export async function listBugReports(req, res, next) {
  try {
    if (!req.user?.is_global_admin) return res.status(403).json({ error: 'Global admin required' });
    res.json({ reports: await reportsDb.allBugReports() });
  } catch (err) { next(err); }
}

const STATUSES = ['Open', 'Closed'];

export async function updateBugReportStatus(req, res, next) {
  try {
    if (!req.user?.is_global_admin) return res.status(403).json({ error: 'Global admin required' });
    const reportId = parseInt(req.params.id);
    if (!Number.isInteger(reportId)) return res.status(400).json({ error: 'id must be an integer' });
    const { status } = req.body ?? {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    const { affectedRows } = await reportsDb.setBugReportStatus(reportId, status);
    if (!affectedRows) return res.status(404).json({ error: 'Bug report not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
