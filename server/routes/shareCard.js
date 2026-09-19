import { Router } from 'express';
import { getEventById } from '../db/queries/events.js';
import { renderCard } from '../services/cardImage.js';

const router = Router();

/**
 * A day at the edge and a year in a reader's own cache.
 *
 * A link doing the rounds is fetched by every reader that sees it, and drawing
 * a card is the most expensive thing this service does, so almost none of them
 * should arrive here. The picture changes when the event does, and the address
 * carries no version, so the edge window is a day rather than a year: an
 * organizer who fixes a typo sees it on the card by tomorrow.
 */
const CACHE = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';

async function serve(res, event) {
  const png = await renderCard(event);
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', CACHE);
  res.send(png);
}

/**
 * The card for one event.
 *
 * There is nobody to authorize here: this address is fetched by a crawler with
 * no cookie, on behalf of whoever the link was pasted to. So an internal event
 * is never drawn, whoever asks. A picture of one pasted into a public channel
 * would be exactly the leak the platform refuses everywhere else, and the
 * shared card in its place says nothing it should not.
 *
 * One event has one address. parseInt read the digits at the front and ignored
 * whatever followed, so 42abc, 42.png and 0042 all named event 42 while being
 * different addresses as far as a shared cache is concerned. That turned the
 * edge cache, which is the whole defence for the most expensive route here,
 * into an unlimited supply of misses: one address per junk suffix, every one of
 * them arriving at a browser. Anything but a plain number is not an address.
 */
const ONE_EVENT = /^[1-9][0-9]*$/;

router.get('/event/:id.png', async (req, res, next) => {
  try {
    if (!ONE_EVENT.test(req.params.id)) return res.status(404).end();
    const event = await getEventById(Number(req.params.id));
    await serve(res, event && !event.is_private ? event : null);
  } catch (err) { next(err); }
});

/** The card every page that is not one event shares. */
router.get('/card.png', async (req, res, next) => {
  try {
    await serve(res, null);
  } catch (err) { next(err); }
});

export default router;
