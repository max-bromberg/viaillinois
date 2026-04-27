import { callGetRSOStats } from '../db/queries/advanced.js';

export async function getRsoStats(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    if (isNaN(rsoId)) return res.status(400).json({ error: 'id must be an integer' });
    const stats = await callGetRSOStats(rsoId);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}
