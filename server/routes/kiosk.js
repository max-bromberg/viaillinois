import { Router } from 'express';
import { getKioskEvents } from '../db/queries/events.js';
import { readPaging, PAGING_LIMITS } from '../lib/pagination.js';
import { recordDenial } from '../services/denialRecorder.js';
import { readWeather } from '../services/weather.js';

const router = Router();

router.get('/events', async (req, res, next) => {
  try {
    // A lobby display asks for this over and over, so the ceiling here is
    // smaller than the feed's. It is not paginated, so only the limit matters.
    const { limit, refusal } = readPaging(req.query, PAGING_LIMITS.kiosk);
    if (refusal) {
      recordDenial({
        reason: 'pagination_refused', route: '/api/v1/kiosk/events',
        authenticated: Boolean(req.user), client: req.clientIp,
      });
      return res.status(400).json({ error: refusal });
    }
    const events = await getKioskEvents(limit);
    res.json({ events });
  } catch (err) { next(err); }
});

/**
 * The forecast for the screens.
 *
 * The screens read it through the platform rather than calling a weather
 * service themselves, so one answer is shared by every screen, a display needs
 * no outbound access of its own, and which of the two sources answered is a
 * detail the screen never has to know.
 *
 * A forecast nobody could fetch is not an error on the screen's part. This
 * answers with nothing and the slide leaves the forecast out, because a lobby
 * display that cannot reach the weather should still show the events.
 */
router.get('/weather', async (req, res) => {
  try {
    res.json({ weather: await readWeather() });
  } catch (err) {
    console.error('reading the forecast failed:', err.message);
    res.json({ weather: null });
  }
});

export default router;
