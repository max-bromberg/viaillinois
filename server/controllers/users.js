import { getUserByNetId } from '../db/queries/users.js';
import { getUserMemberships } from '../db/queries/rso.js';

export async function getMe(req, res, next) {
  try {
    const user = await getUserByNetId(req.user.net_id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const memberships = await getUserMemberships(req.user.net_id);
    res.json({ user: { ...user, memberships } });
  } catch (err) { next(err); }
}
