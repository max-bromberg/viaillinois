import { callGetRSOStats } from '../db/queries/advanced.js';
import { getInterestByRso } from '../db/queries/eventInterest.ts';
import { getFeedbackByRso } from '../db/queries/eventFeedback.ts';

/**
 * What a board reads about its own RSO: members by role, the tags it uses
 * most, how many people are interested in each event still to come, which is
 * the count the removed RSVPs used to give, and what people thought of the
 * events that have just happened.
 *
 * Feedback is aggregated before it leaves the database, and the comments
 * arrive with nobody's name on them. A board that could work out who gave
 * which rating is a board nobody would tell the truth to, and an RSO small
 * enough for four ratings to identify their authors is most of them.
 */
export async function getRsoStats(req, res, next) {
  try {
    const rsoId = parseInt(req.params.id);
    if (isNaN(rsoId)) return res.status(400).json({ error: 'id must be an integer' });
    const [stats, interest, feedback] = await Promise.all([
      callGetRSOStats(rsoId),
      getInterestByRso(rsoId),
      getFeedbackByRso(rsoId),
    ]);
    res.json({
      ...stats,
      interest: interest.map(row => ({
        event_id: row.eventId, title: row.title, start_time: row.startTime, interest_count: row.interestCount,
      })),
      feedback: feedback.map(row => ({
        event_id: row.eventId,
        title: row.title,
        start_time: row.startTime,
        average_rating: row.average,
        rating_count: row.ratings,
        comments: row.comments,
      })),
    });
  } catch (err) {
    next(err);
  }
}
