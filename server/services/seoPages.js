import { getPublicEvents, getEventById } from '../db/queries/events.js';
import { getConfirmedMidterms } from '../db/queries/midterms.js';
import { eventSchema, eventListSchema, siteSchema, organizationSchema } from '../lib/seo/structuredData.js';
import { escapeHtml } from '../lib/seo/render.js';
import { toIsoWithOffset, CAMPUS_TIME_ZONE } from '../lib/timezone.js';
import { cardAlt } from './shareCard.js';

/**
 * What each address should say about itself.
 *
 * Returns the title, description, canonical address, structured data and a
 * readable summary for one route. The summary matters as much as the metadata:
 * without it nothing links to an event page in the HTML, so a crawler that
 * does not run scripts never learns those pages exist.
 */

const NOINDEX = 'noindex, nofollow';
const INDEX = 'index, follow';

/** Signed in areas have nothing to offer a search engine. */
const PRIVATE_PATHS = new Set(['/dashboard', '/admin', '/login', '/scheduler', '/poster']);

const SITE_DESCRIPTION =
  'Find every event run by Electrical and Computer Engineering student organizations at '
  + 'the University of Illinois Urbana-Champaign, in one place. Browse upcoming talks, '
  + 'workshops, socials and info sessions, and see the shared midterm calendar.';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit',
});

function readableTime(value) {
  const iso = toIsoWithOffset(value);
  return iso ? dateFormat.format(new Date(iso)) : '';
}

function locationOf(event) {
  if (event.building) return `${event.building} ${event.room_number ?? ''}`.trim();
  return event.location_text || 'Location to be announced';
}

/** One event as a list entry, with the link that makes the page discoverable. */
function eventListItem(event) {
  return `<li><a href="/events/${event.event_id}"><h3>${escapeHtml(event.title)}</h3></a>`
    + `<p>${escapeHtml(event.rso_name ?? '')}</p>`
    + `<p><time datetime="${escapeHtml(toIsoWithOffset(event.start_time) ?? '')}">`
    + `${escapeHtml(readableTime(event.start_time))}</time></p>`
    + `<p>${escapeHtml(locationOf(event))}</p></li>`;
}

async function homePage(site) {
  let events = [];
  try {
    // The heading says upcoming, so the list has to be upcoming. Asking for
    // every event listed the oldest ones first, which described the site by
    // what it did last year.
    events = await getPublicEvents({ timeframe: 'upcoming' });
  } catch {
    // A page with no summary still beats a page that fails to load.
    return {
      title: 'VIA: events from ECE student organizations at Illinois',
      description: SITE_DESCRIPTION,
      canonical: `${site}/`,
      robots: INDEX,
      jsonLd: [siteSchema(site), organizationSchema(site)],
    };
  }

  const upcoming = events.slice(0, 50);
  return {
    title: 'VIA: events from ECE student organizations at Illinois',
    description: SITE_DESCRIPTION,
    canonical: `${site}/`,
    robots: INDEX,
    type: 'website',
    jsonLd: [eventListSchema(upcoming, site), siteSchema(site), organizationSchema(site)],
    content:
      '<h1>Upcoming ECE student organization events at Illinois</h1>'
      + `<p>${escapeHtml(SITE_DESCRIPTION)}</p>`
      + `<ul>${upcoming.map(eventListItem).join('')}</ul>`,
  };
}

/**
 * The picture a page is shared with.
 *
 * No page set one at all, and the renderer only writes og:image when a page
 * names it, so the picture sitting in public/ was referenced by nothing and a
 * shared VIA link arrived with no picture on it whatsoever.
 */
const sharedCard = site => `${site}/og/card.png`;

async function eventPage(id, site) {
  let event = null;
  try {
    event = await getEventById(id);
  } catch {
    event = null;
  }

  if (!event || event.is_private) {
    return {
      title: 'Event: VIA',
      description: SITE_DESCRIPTION,
      canonical: `${site}/events/${id}`,
      robots: NOINDEX,
      // The shared card rather than this event's own. An internal event is not
      // shown to anybody outside the organization, and the address of a card
      // drawn for one would be a way to read its title without being let in.
      image: sharedCard(site),
    };
  }

  const when = readableTime(event.start_time);
  const where = locationOf(event);
  const organiser = event.rso_name ? `${event.rso_name}` : 'an ECE student organization';

  return {
    title: `${event.title} by ${organiser}: VIA`,
    description: `${organiser} is holding ${event.title} on ${when} at ${where}, `
      + 'at the University of Illinois Urbana-Champaign.',
    canonical: `${site}/events/${event.event_id}`,
    robots: INDEX,
    // Its own card, carrying its own title, organization, date and room.
    image: `${site}/og/event/${event.event_id}.png`,
    imageAlt: cardAlt(event),
    type: 'article',
    jsonLd: [eventSchema(event, site)],
    content:
      `<article><h1>${escapeHtml(event.title)}</h1>`
      + `<p>Hosted by ${escapeHtml(organiser)}</p>`
      + `<p><time datetime="${escapeHtml(toIsoWithOffset(event.start_time) ?? '')}">`
      + `${escapeHtml(when)}</time></p>`
      + `<p>${escapeHtml(where)}</p>`
      + (event.description ? `<p>${escapeHtml(event.description)}</p>` : '')
      + '<p><a href="/">All upcoming ECE events</a></p></article>',
  };
}

async function midtermsPage(site) {
  let midterms = [];
  try {
    midterms = await getConfirmedMidterms();
  } catch {
    midterms = [];
  }

  return {
    title: 'ECE midterm and exam schedule at Illinois: VIA',
    description:
      'The shared midterm and evening exam schedule for Electrical and Computer Engineering '
      + 'courses at the University of Illinois Urbana-Champaign, with dates, times and rooms.',
    canonical: `${site}/midterms`,
    robots: INDEX,
    content:
      '<h1>ECE midterm and exam schedule</h1>'
      + `<ul>${midterms.map(m =>
        `<li>${escapeHtml(m.course_code)}: ${escapeHtml(m.title)}, `
        + `<time datetime="${escapeHtml(toIsoWithOffset(m.start_time) ?? '')}">`
        + `${escapeHtml(readableTime(m.start_time))}</time></li>`).join('')}</ul>`,
  };
}

const STATIC_PAGES = {
  '/calendar': {
    title: 'Calendar of ECE student organization events: VIA',
    description:
      'A month by month calendar of every event run by ECE student organizations at the '
      + 'University of Illinois Urbana-Champaign, alongside the shared midterm schedule.',
  },
  '/about': {
    title: 'About VIA: one place for ECE student organization events',
    description:
      'VIA gathers events from every Electrical and Computer Engineering student organization '
      + 'at the University of Illinois into a single feed, calendar and lobby display.',
  },
  '/updates': {
    title: 'Platform updates: VIA',
    description: 'What has changed on VIA, and what is being worked on next.',
  },
  '/terms': { title: 'Terms of use: VIA', description: 'The terms that apply to using VIA.' },
  '/privacy': {
    title: 'Privacy: VIA',
    description: 'What VIA stores about you, why, and what it does not store.',
  },
};

/**
 * @param {string} path the address being served
 * @param {string} site absolute origin
 */
export async function describePage(path, site) {
  const clean = path.split('?')[0].replace(/\/+$/, '') || '/';

  // Every page that is not one event shares one card, added here rather than
  // in each builder so a page added later cannot quietly ship without one.
  const withCard = page => ({ image: sharedCard(site), ...page });

  if (clean === '/') return withCard(await homePage(site));

  const event = /^\/events\/(\d+)$/.exec(clean);
  if (event) return withCard(await eventPage(Number(event[1]), site));

  if (clean === '/midterms') return withCard(await midtermsPage(site));

  if (STATIC_PAGES[clean]) {
    return withCard({ ...STATIC_PAGES[clean], canonical: `${site}${clean}`, robots: INDEX });
  }

  if (PRIVATE_PATHS.has(clean) || clean.startsWith('/kiosk')) {
    return { title: 'VIA', description: SITE_DESCRIPTION, robots: NOINDEX };
  }

  // An address nobody planned for. Serve it, but do not invite a search engine
  // to keep it: it is either a typo or something that has been removed.
  return { title: 'VIA', description: SITE_DESCRIPTION, robots: NOINDEX };
}
