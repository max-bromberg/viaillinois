import { Router } from 'express';
import { buildCalendar } from '../lib/ics.js';
import { listEvents } from '../db/queries/internalReads.ts';
import { PAGING_LIMITS } from '../lib/pagination.js';
import { getCalendarByTokenHash } from '../db/queries/personalCalendars.ts';
import { TOKEN_PATTERN, hashCalendarToken } from '../lib/personalCalendarToken.js';

/**
 * A person's own calendar, served to their phone.
 *
 * This is on the public surface rather than behind the internal service API,
 * because the thing that fetches it is a calendar application on a phone,
 * which has no service token and no cookie and asks once every few hours
 * forever. The address is the whole of the credential, so:
 *
 * The token is compared by its hash, an address nobody holds is answered with
 * a flat 404 that says nothing about whether a token of that shape could
 * exist, the answer is marked private so that no shared cache keeps one
 * person's calendar, and the file carries only what any student may see, which
 * means no internal event and no event that was called off.
 */

/** How long a phone may keep the file before asking again. */
const CACHE_SECONDS = 300;

const router = Router();

router.get('/:file', async (req, res, next) => {
  try {
    const file = String(req.params.file ?? '');
    if (!file.endsWith('.ics')) return res.status(404).type('text/plain').send('Not found');
    const token = file.slice(0, -'.ics'.length);
    if (!TOKEN_PATTERN.test(token)) return res.status(404).type('text/plain').send('Not found');

    const calendar = await getCalendarByTokenHash(hashCalendarToken(token));
    if (!calendar) return res.status(404).type('text/plain').send('Not found');

    // Null is every organization, which is what somebody who has not chosen
    // means, and the feed reads an empty filter as exactly that. An empty list
    // is the other thing: a person who unticked every organization, whose
    // calendar holds nothing, so it is answered without asking the feed at all.
    const follows = calendar.rsoIds;
    const events = Array.isArray(follows) && follows.length === 0
      ? []
      : await listEvents({
        rsoIds: follows ?? [],
        timeframe: 'upcoming',
        // Nobody's internal events, whoever the address belongs to. An address
        // travels, and a file a phone caches is not the place to put an event
        // that only members may read.
        privateRsoIds: [],
        limit: PAGING_LIMITS.events.maxLimit,
        offset: 0,
      });

    res.set('Cache-Control', `private, max-age=${CACHE_SECONDS}`);
    res.type('text/calendar; charset=utf-8');
    res.send(buildCalendar(events));
  } catch (err) { next(err); }
});

export default router;
