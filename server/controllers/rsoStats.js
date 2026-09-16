import { callGetRSOStats } from '../db/queries/advanced.js';
import { getInterestByRso } from '../db/queries/eventInterest.ts';
import { getFeedbackByRso } from '../db/queries/eventFeedback.ts';
import { getViewsByRso, getViewTotalByRso } from '../db/queries/eventViews.ts';
import { campusStartOfToday } from '../lib/timezone.js';

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
    // for and long enough to cover a term's worth of announcements. Counted
    // back from the campus day, because Event_Views.day is written from the
    // campus day: between the evening and midnight the UTC date is already
    // tomorrow, and the window would quietly start a day late and drop its
    // oldest day. Every other window in the platform is counted this way.
    const [y, m, d] = campusStartOfToday().slice(0, 10).split('-').map(Number);
    const ninetyDaysBack = new Date(y, m - 1, d - 90);
    const pad = n => String(n).padStart(2, '0');
    const since = `${ninetyDaysBack.getFullYear()}-${pad(ninetyDaysBack.getMonth() + 1)}-${pad(ninetyDaysBack.getDate())}`;

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
