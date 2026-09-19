import { getPublicEvents, getEventById } from '../db/queries/events.js';
import { getConfirmedMidterms } from '../db/queries/midterms.js';
import {
  getPublicOrganization, getPublicOrganizations, getPublicEventsForRso,
} from '../db/queries/rso.js';
import {
  eventSchema, eventListSchema, siteSchema, organizationSchema,
  studentOrganizationSchema, organizationListSchema, breadcrumbSchema,
} from '../lib/seo/structuredData.js';
import { escapeHtml } from '../lib/seo/render.js';
import { isUpdateSlug } from '../lib/seo/updateSlugs.js';
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

/**
 * A single path segment as it was written, where it can be read at all.
 *
 * An address arrives here as it was requested, so a slug carrying anything
 * escaped is escaped here too. A stray percent sign is not a valid escape and
 * decoding one throws, which would turn a malformed address into a crash
 * rather than a page politely declining to be indexed, so the segment is
 * handed back untouched and simply matches no update.
 */
function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * What a page says when VIA could not ask the database at all.
 *
 * Not knowing is not the same as knowing there is nothing. Every builder here
 * used to treat a failed query as an empty answer, so a minute of the database
 * being away served noindex for every event on the site, and noindex is the
 * one instruction Google acts on immediately and takes weeks to undo. A page
 * that could not be described says so, and the shell turns that into a 503,
 * which is a crawler being asked to come back rather than told to forget.
 */
function couldNotAsk(site, path) {
  return {
    title: 'VIA',
    description: SITE_DESCRIPTION,
    canonical: `${site}${path}`,
    unavailable: true,
  };
}

async function eventPage(id, site) {
  let event = null;
  try {
    event = await getEventById(id);
  } catch {
    return couldNotAsk(site, `/events/${id}`);
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

/**
 * The page listing every organization that has something to show.
 *
 * It exists for two readers. A student who knows the name of a club and not
 * what it has been running finds it here, and a crawler that reads one page
 * and follows its links finds every organization from here, which is a second
 * route into every event page. Before this, the only route to an event page
 * was the front page, and a site with one way into each of its pages is one a
 * search engine discovers and declines to crawl, which is what Search Console
 * has been reporting.
 */
async function organizationsPage(site) {
  let organizations = [];
  try {
    organizations = await getPublicOrganizations();
  } catch {
    // Not knowing is not the same as knowing there is none, and this is the
    // page whose whole purpose is to be a route into every other one. Served
    // as an empty list it would be an indexable page headed "Every ECE student
    // organization" with nothing under it, which is the thin content the rest
    // of this work package exists to stop serving.
    return couldNotAsk(site, '/organizations');
  }

  const description =
    'Every Electrical and Computer Engineering student organization at the University of '
    + 'Illinois Urbana-Champaign that publishes its events on VIA, with what each one is '
    + 'and what it has coming up.';

  return {
    title: 'ECE student organizations at Illinois: VIA',
    description,
    canonical: `${site}/organizations`,
    robots: INDEX,
    type: 'website',
    jsonLd: [
      organizationListSchema(organizations, site),
      breadcrumbSchema([
        { name: 'Events', path: '/' },
        { name: 'Organizations', path: '/organizations' },
      ], site),
    ],
    content:
      '<h1>ECE student organizations at Illinois</h1>'
      + `<p>${escapeHtml(description)}</p>`
      + `<ul>${organizations.map(rso =>
        `<li><a href="/organizations/${rso.rso_id}"><h2>${escapeHtml(rso.name)}</h2></a>`
        + (rso.description ? `<p>${escapeHtml(rso.description)}</p>` : '')
        + `<p>${escapeHtml(countsLine(rso))}</p></li>`).join('')}</ul>`,
  };
}

/** How much an organization has on, in a sentence rather than a pair of numbers. */
function countsLine(rso) {
  const upcoming = Number(rso.upcoming_count ?? 0);
  const total = Number(rso.event_count ?? 0);
  if (upcoming === 0) {
    return total === 1
      ? 'One event on VIA, none of it still to come.'
      : `${total} events on VIA, none of them still to come.`;
  }
  return upcoming === 1
    ? `One event still to come, out of ${total} on VIA.`
    : `${upcoming} events still to come, out of ${total} on VIA.`;
}

async function organizationPage(id, site) {
  let rso = null;
  let events = { upcoming: [], past: [] };
  try {
    rso = await getPublicOrganization(id);
  } catch {
    return couldNotAsk(site, `/organizations/${id}`);
  }

  if (rso) {
    try {
      events = await getPublicEventsForRso(id);
    } catch {
      // The organization is real and its description is worth serving, so a
      // listing that could not be read is an empty listing rather than a page
      // nobody is shown.
      events = { upcoming: [], past: [] };
    }
  }

  // An organization with nothing public has an empty page, and an empty page
  // is the thin content a search engine discovers and then declines to keep.
  if (!rso) {
    return {
      title: 'Student organization: VIA',
      description: SITE_DESCRIPTION,
      canonical: `${site}/organizations/${id}`,
      robots: NOINDEX,
    };
  }

  const about = rso.description?.trim();
  const description = [
    `${rso.name} is an Electrical and Computer Engineering student organization at the `
    + 'University of Illinois Urbana-Champaign.',
    about,
    'See what it has coming up, with the dates, the rooms and what each event is.',
  ].filter(Boolean).join(' ').slice(0, 300);

  const listed = [...events.upcoming, ...events.past];

  return {
    title: `${rso.name}: events at Illinois: VIA`,
    description,
    canonical: `${site}/organizations/${rso.rso_id}`,
    robots: INDEX,
    type: 'website',
    jsonLd: [
      studentOrganizationSchema(rso, site),
      eventListSchema(listed, site),
      breadcrumbSchema([
        { name: 'Events', path: '/' },
        { name: 'Organizations', path: '/organizations' },
        { name: rso.name, path: `/organizations/${rso.rso_id}` },
      ], site),
    ],
    content:
      `<article><h1>${escapeHtml(rso.name)}</h1>`
      + (about ? `<p>${escapeHtml(about)}</p>` : '')
      + (rso.founded_year ? `<p>Founded in ${escapeHtml(rso.founded_year)}.</p>` : '')
      + (events.upcoming.length
        ? `<h2>Coming up</h2><ul>${events.upcoming.map(eventListItem).join('')}</ul>`
        : '<p>Nothing from this organization is coming up on VIA just now.</p>')
      + (events.past.length
        ? `<h2>Recently</h2><ul>${events.past.map(eventListItem).join('')}</ul>`
        : '')
      + '<p><a href="/organizations">Every ECE student organization</a></p>'
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
  if (clean === '/organizations') return withCard(await organizationsPage(site));

  const organization = /^\/organizations\/(\d+)$/.exec(clean);
  if (organization) return withCard(await organizationPage(Number(organization[1]), site));

  if (STATIC_PAGES[clean]) {
    return withCard({ ...STATIC_PAGES[clean], canonical: `${site}${clean}`, robots: INDEX });
  }

  /*
   * One platform update, under its own address. These were falling past every
   * case and serving the fallback, which is the site title, no canonical
   * address and noindex, so a page written to be read was telling search
   * engines to ignore it.
   *
   * Only an update that was actually written. Answering for any address of
   * this shape meant anybody could hand a crawler an address nobody had ever
   * written an update for and VIA would agree it was a real page, which is the
   * thin content the rest of this work package set out to stop serving.
   */
  const update = /^\/updates\/([^/]+)$/.exec(clean);
  if (update && isUpdateSlug(safeDecode(update[1]))) {
    return withCard({
      title: 'Platform update: VIA',
      description: 'What has changed on VIA, and what is being worked on next.',
      canonical: `${site}${clean}`,
      robots: INDEX,
    });
  }

  /*
   * A tab of About is the same page reached at a different address, so it
   * points at About rather than asking to be kept as a page of its own. That
   * is what a canonical address is for, and it is the honest answer to Search
   * Console reporting pages whose canonical the site never chose.
   */
  if (/^\/about\/[^/]+$/.test(clean)) {
    return withCard({ ...STATIC_PAGES['/about'], canonical: `${site}/about`, robots: INDEX });
  }

  if (PRIVATE_PATHS.has(clean) || clean.startsWith('/kiosk')) {
    return { title: 'VIA', description: SITE_DESCRIPTION, robots: NOINDEX };
  }

  // An address nobody planned for. Serve it, but do not invite a search engine
  // to keep it: it is either a typo or something that has been removed.
  return { title: 'VIA', description: SITE_DESCRIPTION, robots: NOINDEX };
}
