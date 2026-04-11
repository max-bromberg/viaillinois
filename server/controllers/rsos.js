import * as rsoDb from '../db/queries/rso.js';
import { checkRsoAdmin } from '../middleware/auth.js';

export async function listRsos(req, res, next) {
  try {
    const rsos = await rsoDb.getAllRsos();
    res.json({ rsos });
  } catch (err) { next(err); }
}

export async function getRso(req, res, next) {
  try {
    const rows = await rsoDb.getRsoById(parseInt(req.params.id));
    if (!rows || !rows.length) return res.status(404).json({ error: 'RSO not found' });
    const first = rows[0];
    const rso = {
      rso_id:       first.rso_id,
      rso_name:     first.rso_name,
      description:  first.description,
      logo_color:   first.logo_color,
      founded_year: first.founded_year,
      event_count:  first.event_count,
      members: rows.map(r => ({
        net_id:    r.net_id,
        full_name: r.full_name,
        email:     r.email,
        role:      r.role,
        joined_at: r.joined_at,
      })),
    };
    res.json({ rso });
  } catch (err) { next(err); }
}

export async function updateRso(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    const { name, description, logo_color, founded_year } = req.body;
    await rsoDb.updateRso(rsoId, { name, description, logo_color, founded_year });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function addMember(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    const { netId, role = 'Member' } = req.body;
    if (!netId) return res.status(400).json({ error: 'netId required' });
    if (!['Member', 'Board', 'Admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be Member, Board, or Admin' });
    }
    await rsoDb.addMember(netId, rsoId, role);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

export async function removeMember(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    const { netId } = req.params;
    const result = await rsoDb.removeMember(netId, rsoId);
    if (!result.affectedRows) return res.status(404).json({ error: 'Member not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function createRso(req, res, next) {
  try {
    const { name, description, logo_color = '#000000', founded_year } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await rsoDb.createRso({ name, description, logo_color, founded_year });
    res.status(201).json({ rso_id: result.insertId });
  } catch (err) { next(err); }
}
