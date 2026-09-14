import { callGetRSOStats } from '../db/queries/advanced.js';
import { getInterestByRso } from '../db/queries/eventInterest.ts';
import { getFeedbackByRso } from '../db/queries/eventFeedback.ts';
import { getViewsByRso, getViewTotalByRso } from '../db/queries/eventViews.ts';

/**
 * What a board reads about its own RSO: members by role, the tags it uses
 * most, how many times each of its events was read about, how many people are
 * interested in each event still to come, and what people thought of the
 * events that have just happened.
 *
 * Interest and feedback both arrive through the Discord bot, so a board whose
 * members are not on Discord opened this tab and read nothing but zeros. The
 * readings are the one number the platform collects by itself, from the
 * reading somebody is already doing, and they are here beside the other two
 * rather than in place of them.
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
    // The last ninety days, which is the window the refusal counts are kept
    // for and long enough to cover a term's worth of announcements.
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

    const [stats, interest, feedback, views, viewTotal] = await Promise.all([
      callGetRSOStats(rsoId),
      getInterestByRso(rsoId),
      getFeedbackByRso(rsoId),
      getViewsByRso(rsoId, { since }),
      getViewTotalByRso(rsoId, { since }),
    ]);
    res.json({
      ...stats,
      views: views.map(row => ({
        event_id: row.eventId, title: row.title, start_time: row.startTime, view_count: row.viewCount,
      })),
      view_total: viewTotal,
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
