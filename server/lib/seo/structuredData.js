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

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    url: `${site}/events/${event.event_id}`,
    startDate: toIsoWithOffset(event.start_time),
    endDate: toIsoWithOffset(event.end_time),
    description: event.description?.trim() || undefined,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: online
      ? 'https://schema.org/OnlineEventAttendanceMode'
      : 'https://schema.org/OfflineEventAttendanceMode',
    location,
    organizer: event.rso_name
      ? { '@type': 'Organization', name: event.rso_name }
      : undefined,
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
