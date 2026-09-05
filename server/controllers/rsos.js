import * as rsoDb from '../db/queries/rso.js';
import * as eventsDb from '../db/queries/events.js';
import { checkRsoAdmin } from '../middleware/auth.js';
import * as usersDb from '../db/queries/users.js';
import { parseRoster } from '../lib/netId.js';
import { readPaging, PAGING_LIMITS } from '../lib/pagination.js';
import { recordDenial } from '../services/denialRecorder.js';
import * as outbox from '../db/queries/outbox.ts';
import { pushFacts } from '../services/linkedRoles.js';

/** Largest roster accepted in one request. */
const MAX_ROSTER = 200;

/**
 * Tell Discord that somebody's board membership may have changed.
 *
 * One of the three linked role facts is whether the person sits on a board, so
 * it is refreshed here rather than left until the next time they link. The
 * service passes over a person with no Discord authorization on its own, and
 * every failure is swallowed, because a roster is recorded on VIA whatever
 * Discord is doing.
 */
async function refreshLinkedRoles(netId) {
  try {
    await pushFacts(netId);
  } catch (err) {
    console.error(`refreshing the linked role facts for ${netId} failed:`, err.message);
  }
}

export async function deleteRso(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    if (isNaN(rsoId)) return res.status(400).json({ error: 'id must be an integer' });
    await rsoDb.deleteRso(rsoId);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function listRsos(req, res, next) {
  try {
    const { limit, offset, refusal } = readPaging(req.query, PAGING_LIMITS.rsos);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/rsos',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    const rsos = await rsoDb.getAllRsos({ limit, offset });
    res.json({ rsos });
  } catch (err) { next(err); }
}

export async function getRso(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    const rows = await rsoDb.getRsoById(rsoId);
    if (!rows || !rows.length) return res.status(404).json({ error: 'RSO not found' });
    const first = rows[0];
    let events = await eventsDb.getEventsByRso(rsoId);

    // Private events are visible only to global admins and members of this RSO.
    // Everyone else (including anonymous viewers) sees public events only.
    let canSeePrivate = false;
    // A member list is directory information for the people running the RSO,
    // not for everyone with an account. Email addresses in particular are
    // personal data, and every UIUC student can sign in, so handing them out
    // to any authenticated request makes the platform a scraping target.
    let canSeeContactDetails = false;
    if (req.user?.is_global_admin) {
      canSeePrivate = true;
      canSeeContactDetails = true;
    } else if (req.user?.net_id) {
      const memberships = await rsoDb.getUserMemberships(req.user.net_id);
      canSeePrivate = memberships.some(m => m.rso_id === rsoId);
      canSeeContactDetails = memberships.some(m => m.rso_id === rsoId && m.role === 'Board');
    }
    if (!canSeePrivate) events = events.filter(e => !e.is_private);

    const rso = {
      rso_id:       first.rso_id,
      name:         first.rso_name,
      description:  first.description,
      logo_color:   first.logo_color,
      founded_year: first.founded_year,
      event_count:  first.event_count,
      members: rows.filter(r => r.net_id).map(r => ({
        ...(req.user ? { net_id: r.net_id, joined_at: r.joined_at } : {}),
        ...(canSeeContactDetails ? { email: r.email, invited_at: r.invited_at } : {}),
        full_name: r.full_name,
        role:      r.role,
      })),
      events,
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

/**
 * Add people to an RSO.
 *
 * Takes one NetID or a pasted list of them, and accepts Illinois addresses as
 * well, because a board's roster usually arrives as a column of addresses out
 * of a spreadsheet.
 *
 * Someone who has never signed in is invited rather than refused: a row is
 * created for them so the membership has something to point at, carrying no
 * name and no email until they arrive. Waiting for every person to sign in
 * before the board could record them was the thing that made this painful.
 */
export async function addMember(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    const { netId, role = 'Member' } = req.body;
    if (!netId) return res.status(400).json({ error: 'netId required' });
    if (!['Member', 'Editor', 'Board'].includes(role)) {
      return res.status(400).json({ error: 'role must be Member, Editor, or Board' });
    }

    const { netIds, rejected } = parseRoster(netId);
    if (netIds.length === 0) {
      return res.status(400).json({ error: 'No NetID could be read from that', rejected });
    }
    // Each name costs a lookup and an insert, so an enormous paste is one
    // request asking for unbounded work. Two hundred is already larger than
    // any roster on this platform.
    if (netIds.length > MAX_ROSTER) {
      return res.status(400).json({
        error: `That is ${netIds.length} people, and at most ${MAX_ROSTER} can be added at once.`,
      });
    }

    const invited = [];
    for (const id of netIds) {
      if (!await usersDb.getUserByNetId(id)) {
        await usersDb.inviteUser(id);
        invited.push(id);
      }
      // Adding somebody who is already a member in the same role changes
      // nothing, and a roster pasted twice should not tell the Discord bot
      // that everybody's membership changed again. The row as it stands is
      // read first, because the insert reports the same thing whether it wrote
      // a new row or found an identical one.
      const already = await rsoDb.getMembership(id, rsoId);
      await rsoDb.addMember(id, rsoId, role);
      if (already?.role !== role) {
        await outbox.recordMembershipChanged({ netId: id, rsoId, role });
        await refreshLinkedRoles(id);
      }
    }

    res.status(201).json({ ok: true, added: netIds.length, invited, rejected });
  } catch (err) { next(err); }
}

export async function removeMember(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    const { netId } = req.params;
    const result = await rsoDb.removeMember(netId, rsoId);
    if (!result.affectedRows) return res.status(404).json({ error: 'Member not found' });
    await outbox.recordMembershipChanged({ netId, rsoId, role: null });
    await refreshLinkedRoles(netId);
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
