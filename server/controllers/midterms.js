import * as midtermsDb from '../db/queries/midterms.js';

export async function listMidterms(req, res, next) {
  try {
    const { courseCode } = req.query;
    const midterms = await midtermsDb.getMidterms({ courseCode: courseCode || null });
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

export async function voteMidterm(req, res, next) {
  try {
    const midtermId = parseInt(req.params.id);
    if (isNaN(midtermId)) return res.status(400).json({ error: 'id must be an integer' });
    const { value } = req.body;
    if (value !== 1 && value !== -1) {
      return res.status(400).json({ error: 'value must be 1 or -1' });
    }
    await midtermsDb.upsertVote(midtermId, req.user.net_id, value);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function getConfirmedMidtermsHandler(req, res, next) {
  try {
    const midterms = await midtermsDb.getConfirmedMidterms();
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
