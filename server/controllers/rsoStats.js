import { callGetRSOStats } from '../db/queries/advanced.js';
import { getInterestByRso } from '../db/queries/eventInterest.ts';

/**
 * What a board reads about its own RSO: members by role, the tags it uses
 * most, and how many people are interested in each event still to come, which
 * is the count the removed RSVPs used to give.
 */
export async function getRsoStats(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    if (isNaN(rsoId)) return res.status(400).json({ error: 'id must be an integer' });
    const [stats, interest] = await Promise.all([callGetRSOStats(rsoId), getInterestByRso(rsoId)]);
    res.json({
      ...stats,
      interest: interest.map(row => ({
        event_id: row.eventId, title: row.title, start_time: row.startTime, interest_count: row.interestCount,
      })),
    });
  } catch (err) {
    next(err);
  }
}
