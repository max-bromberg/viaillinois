import { toIsoWithOffset } from '../timezone.js';

/**
 * Schema.org descriptions of what is on a page.
 *
 * This is the only machine readable account of an event that VIA publishes.
 * Search engines use it to show an event with its date and place rather than
 * as a bare link, and assistants that read pages rather than render them get
 * their answer from here, because nothing else on the page survives without
 * JavaScript.
 */

/** Every RSO event happens on or around campus unless it says otherwise. */
const CAMPUS_ADDRESS = {
  '@type': 'PostalAddress',
  addressLocality: 'Urbana',
  addressRegion: 'IL',
  addressCountry: 'US',
};

/** Words that mean the event is happening on a video call, not in a room. */
const ONLINE = /\b(zoom|teams|google meet|meet\.google|webex|discord|online|virtual|remote|livestream|twitch)\b/i;

const isUrl = text => /^https?:\/\/\S+$/i.test(String(text ?? '').trim());

/** Drop keys with nothing in them, so the output has no empty fields. */
function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined && v !== null));
}

function locationFor(event) {
  const room = event.building
    ? `${event.building} ${event.room_number ?? ''}`.trim()
    : null;

  if (room) {
    return { '@type': 'Place', name: room, address: CAMPUS_ADDRESS };
  }

  const text = event.location_text?.trim();
  if (!text) return undefined;

  if (isUrl(text) || ONLINE.test(text)) {
    return compact({
      '@type': 'VirtualLocation',
      name: isUrl(text) ? undefined : text,
      url: isUrl(text) ? text : undefined,
    });
  }

  return { '@type': 'Place', name: text, address: CAMPUS_ADDRESS };
}

/**
 * One event, described the way Google's event listings and assistants expect.
 *
 * @param {object} event a row from the event queries
 * @param {string} site absolute origin, such as https://viaillinois.com
 */
export function eventSchema(event, site) {
  const location = locationFor(event);
  const online = location?.['@type'] === 'VirtualLocation';
  const url = `${site}/events/${event.event_id}`;
  const startDate = toIsoWithOffset(event.start_time);

  /*
   * The organization putting the event on, named as both the organizer and the
   * performer.
   *
   * Google asks for a performer on an event and marks a listing without one as
   * incomplete. For a talk or a workshop run by a student organization, the
   * organization is who is putting it on and who is standing at the front, so
   * one description answers both, rather than a person being invented for a
   * field. The address is left off where VIA has no identifier for the
   * organization, because a link to a page that does not exist is worse than
   * no link.
   */
  const host = event.rso_name
    ? compact({
      '@type': 'Organization',
      name: event.rso_name,
      url: event.rso_id ? `${site}/organizations/${event.rso_id}` : undefined,
    })
    : undefined;

  const tags = String(event.tags ?? '').trim();

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    url,
    startDate,
    endDate: toIsoWithOffset(event.end_time),
    description: event.description?.trim() || undefined,
    // A cancelled event stays on the site so that somebody who planned to go
    // is told. Described here as still scheduled, it would go on being listed
    // as happening everywhere the listing was syndicated, which is the
    // opposite of telling them.
    eventStatus: event.cancelled_at
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: online
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location,
    organizer: host,
    performer: host,
    /*
     * The card drawn for this event, which is the only picture of it VIA has.
     * An internal event has no card: its address would be a way to read the
     * title of something nobody outside the organization is shown.
     */
    image: event.is_private ? undefined : [`${site}/og/event/${event.event_id}.png`],
    /*
     * Everything on VIA is free to turn up to, and saying so is what keeps a
     * listing from being shown with no price on it, which reads as though
     * there may be one. The offer opens when the listing does, because there
     * is no other moment VIA knows of.
     */
    offers: compact({
      '@type': 'Offer',
      url,
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      validFrom: startDate ?? undefined,
    }),
    keywords: tags || undefined,
    inLanguage: 'en-US',
    isAccessibleForFree: true,
  });
}

/**
 * A page of events as an ordered list, so a crawler that reads one page can
 * find the rest without executing anything.
 */
export function eventListSchema(events, site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: events.map((event, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: eventSchema(event, site),
    })),
  };
}

/** The site itself, including how to run a search on it. */
export function siteSchema(site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'VIA',
    alternateName: 'Virtually Integrated Agenda',
    url: site,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${site}/?keyword={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Who publishes the site. */
export function organizationSchema(site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'VIA',
    url: site,
    logo: `${site}/via_logo_black.svg`,
    description:
      'VIA lists events from registered student organizations in the Electrical and '
      + 'Computer Engineering department at the University of Illinois Urbana-Champaign.',
    areaServed: { '@type': 'Place', name: 'University of Illinois Urbana-Champaign' },
  };
}

/**
 * One student organization, as the page for it describes itself.
 *
 * Every event listing names its organizer and points at this page, so this is
 * what a search engine and an assistant find when they follow that link. An
 * organization with no public events has no page, so there is no case here for
 * one with nothing to say.
 *
 * @param {object} rso a row from getPublicOrganization
 * @param {string} site absolute origin
 */
export function studentOrganizationSchema(rso, site) {
  return compact({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: rso.name,
    url: `${site}/organizations/${rso.rso_id}`,
    description: rso.description?.trim() || undefined,
    // A year rather than a date, which is what schema.org takes and all VIA
    // records. A founding year of zero is not a year anybody entered.
    foundingDate: rso.founded_year ? String(rso.founded_year) : undefined,
    parentOrganization: {
      '@type': 'CollegeOrUniversity',
      name: 'University of Illinois Urbana-Champaign',
      url: 'https://illinois.edu',
    },
    areaServed: { '@type': 'Place', name: 'University of Illinois Urbana-Champaign' },
  });
}

/**
 * Every published organization as one list, which is what the page listing
 * them offers a crawler that reads it and follows nothing.
 */
export function organizationListSchema(organizations, site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: organizations.map((rso, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: studentOrganizationSchema(rso, site),
    })),
  };
}

/**
 * The trail from the front page down to where the reader is.
 *
 * A search result that shows the path rather than a bare address is one a
 * reader can place, and the trail is also how a crawler is told which page
 * sits under which, which nothing else on a single page application says.
 *
 * @param {Array<{ name: string, path: string }>} crumbs from the front page inwards
 */
export function breadcrumbSchema(crumbs, site) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${site}${crumb.path}`,
    })),
  };
}
