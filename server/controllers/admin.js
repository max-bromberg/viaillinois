import bcrypt from 'bcryptjs';
import * as usersDb from '../db/queries/users.js';

export async function listUsers(req, res, next) {
  try {
    const users = await usersDb.getAllLocalUsers();
    res.json({ users });
  } catch (err) { next(err); }
}

export async function createUser(req, res, next) {
  try {
    const { net_id, full_name, email, password } = req.body;
    if (!net_id || !full_name || !email || !password) {
      return res.status(400).json({ error: 'net_id, full_name, email, password required' });
    }
    await usersDb.upsertUser({ net_id, full_name, email });
    const hash = await bcrypt.hash(password, 10);
    await usersDb.createLocalAccount(net_id, hash);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

export async function updateUser(req, res, next) {
  try {
    const { netId } = req.params;
    const { full_name, email } = req.body;
    await usersDb.updateUser(netId, { full_name, email });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function resetPassword(req, res, next) {
  try {
    const { netId } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });
    const hash = await bcrypt.hash(password, 10);
    await usersDb.updateLocalPassword(netId, hash);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function deleteUser(req, res, next) {
  try {
    const { netId } = req.params;
    const result = await usersDb.deleteUser(netId);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}
