import { describe, it, expect } from 'vitest';
import { eventSchema, eventListSchema, siteSchema, organizationSchema } from '../../lib/seo/structuredData.js';

const SITE = 'https://viaillinois.com';

const inRoom = {
  event_id: 12,
  title: 'PCB Design Workshop',
  description: 'Learn to lay out a two layer board.',
  start_time: '2026-10-01 18:00:00',
  end_time: '2026-10-01 20:00:00',
  rso_name: 'HKN',
  building: 'Electrical & Computer Eng Bldg',
  room_number: '1002',
  location_text: null,
  is_private: 0,
};

describe('eventSchema', () => {
  it('describes the event well enough for a search engine to list it', () => {
    const schema = eventSchema(inRoom, SITE);
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Event');
    expect(schema.name).toBe('PCB Design Workshop');
    expect(schema.url).toBe(`${SITE}/events/12`);
    expect(schema.description).toBe('Learn to lay out a two layer board.');
  });

  /** Without an offset the time is ambiguous, and Google rejects the listing. */
  it('publishes times with the campus offset', () => {
    const schema = eventSchema(inRoom, SITE);
    expect(schema.startDate).toBe('2026-10-01T18:00:00-05:00');
    expect(schema.endDate).toBe('2026-10-01T20:00:00-05:00');
  });

  it('names the room and places it on campus', () => {
    const { location } = eventSchema(inRoom, SITE);
    expect(location['@type']).toBe('Place');
    expect(location.name).toBe('Electrical & Computer Eng Bldg 1002');
    expect(location.address).toMatchObject({
      '@type': 'PostalAddress', addressLocality: 'Urbana', addressRegion: 'IL', addressCountry: 'US',
    });
  });

  it('credits the RSO as the organiser', () => {
    expect(eventSchema(inRoom, SITE).organizer).toMatchObject({ '@type': 'Organization', name: 'HKN' });
  });

  it('says the event is happening, which Google treats as required', () => {
    const schema = eventSchema(inRoom, SITE);
    expect(schema.eventStatus).toBe('https://schema.org/EventScheduled');
    expect(schema.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode');
  });

  /**
   * A cancelled event stays on the site so that somebody who planned to go is
   * told. Described as still scheduled, it is also still listed as happening
   * everywhere the listing was syndicated, which is the opposite of telling
   * them.
   */
  it('says the event was called off when it was', () => {
    const schema = eventSchema({ ...inRoom, cancelled_at: '2026-09-20 09:00:00' }, SITE);
    expect(schema.eventStatus).toBe('https://schema.org/EventCancelled');
  });

  it('says it is happening when the cancellation column is empty', () => {
    expect(eventSchema({ ...inRoom, cancelled_at: null }, SITE).eventStatus)
      .toBe('https://schema.org/EventScheduled');
  });

  /**
   * A free text location that names a video call is an online event, and
   * saying so is the difference between being listed correctly and being
   * listed as happening at a place that does not exist.
   */
  it('treats a video call as an online event', () => {
    const schema = eventSchema({ ...inRoom, building: null, room_number: null, location_text: 'Zoom' }, SITE);
    expect(schema.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode');
    expect(schema.location['@type']).toBe('VirtualLocation');
  });

  it('carries the link when the online location is one', () => {
    const schema = eventSchema(
      { ...inRoom, building: null, room_number: null, location_text: 'https://illinois.zoom.us/j/123' }, SITE);
    expect(schema.location.url).toBe('https://illinois.zoom.us/j/123');
  });

  it('treats other free text as a place, since that is what it usually is', () => {
    const schema = eventSchema(
      { ...inRoom, building: null, room_number: null, location_text: 'Illini Union, second floor' }, SITE);
    expect(schema.location['@type']).toBe('Place');
    expect(schema.location.name).toBe('Illini Union, second floor');
  });

  it('leaves the location out entirely when there is none to give', () => {
    const schema = eventSchema({ ...inRoom, building: null, room_number: null, location_text: null }, SITE);
    expect(schema.location).toBeUndefined();
  });

  it('omits a description rather than publishing an empty one', () => {
    expect(eventSchema({ ...inRoom, description: null }, SITE).description).toBeUndefined();
  });
});

describe('eventListSchema', () => {
  it('lists the events in order so a crawler can follow them', () => {
    const list = eventListSchema([inRoom, { ...inRoom, event_id: 13, title: 'Second' }], SITE);
    expect(list['@type']).toBe('ItemList');
    expect(list.itemListElement).toHaveLength(2);
    expect(list.itemListElement[0]).toMatchObject({ '@type': 'ListItem', position: 1 });
    expect(list.itemListElement[1].item.name).toBe('Second');
  });

  it('is empty rather than broken when there are no events', () => {
    expect(eventListSchema([], SITE).itemListElement).toEqual([]);
  });
});

describe('siteSchema', () => {
  it('tells search engines how to search the site directly', () => {
    const schema = siteSchema(SITE);
    expect(schema['@type']).toBe('WebSite');
    expect(schema.potentialAction['@type']).toBe('SearchAction');
    expect(schema.potentialAction.target.urlTemplate).toContain('{search_term_string}');
  });
});

describe('organizationSchema', () => {
  it('identifies who runs the site and where it lives', () => {
    const schema = organizationSchema(SITE);
    expect(schema['@type']).toBe('Organization');
    expect(schema.url).toBe(SITE);
    expect(schema.logo).toMatch(/^https:\/\//);
  });
});

/**
 * The four fields Search Console reported missing on all twenty event pages.
 *
 * Google marks image, offers, performer and a url on the organizer as
 * recommended rather than required, so the listings were valid and were being
 * shown plainly. A listing that carries them is eligible for the richer
 * treatment, with the picture and the price beside it, and an assistant
 * reading the page gets told what a person would have to ask about otherwise,
 * which is whether it costs anything and who is running it.
 */
describe('the fields a rich event listing needs', () => {
  const hosted = { ...inRoom, rso_id: 7, tags: 'workshop, hardware' };

  it('carries a picture, which is the card drawn for that event', () => {
    expect(eventSchema(hosted, SITE).image).toEqual([`${SITE}/og/event/12.png`]);
  });

  /**
   * Every event on VIA is free to turn up to. Saying so is what stops a
   * listing being shown without a price, which reads as though there may be
   * one.
   */
  it('says that turning up costs nothing, in the shape an offer takes', () => {
    const { offers } = eventSchema(hosted, SITE);
    expect(offers['@type']).toBe('Offer');
    expect(offers.price).toBe('0');
    expect(offers.priceCurrency).toBe('USD');
    expect(offers.availability).toBe('https://schema.org/InStock');
    expect(offers.url).toBe(`${SITE}/events/12`);
    expect(offers.validFrom).toBe('2026-10-01T18:00:00-05:00');
  });

  it('names the organization as the one putting the event on', () => {
    const { performer } = eventSchema(hosted, SITE);
    expect(performer['@type']).toBe('Organization');
    expect(performer.name).toBe('HKN');
    expect(performer.url).toBe(`${SITE}/organizations/7`);
  });

  it('points the organizer at the page for that organization', () => {
    const { organizer } = eventSchema(hosted, SITE);
    expect(organizer['@type']).toBe('Organization');
    expect(organizer.name).toBe('HKN');
    expect(organizer.url).toBe(`${SITE}/organizations/7`);
  });

  /** The tags a board put on an event are what it is about. */
  it('carries what the event is about, from the tags it was given', () => {
    expect(eventSchema(hosted, SITE).keywords).toBe('workshop, hardware');
  });

  it('says what language it is in, which an assistant reads before it answers', () => {
    expect(eventSchema(hosted, SITE).inLanguage).toBe('en-US');
  });

  /**
   * An event whose organization VIA has no identifier for still gets a name.
   * A url pointing at a page that does not exist is worse than none.
   */
  it('leaves the addresses off where there is no organization to point at', () => {
    const schema = eventSchema({ ...inRoom, rso_id: null }, SITE);
    expect(schema.organizer.name).toBe('HKN');
    expect(schema.organizer.url).toBeUndefined();
    expect(schema.performer.url).toBeUndefined();
  });

  it('carries no keywords for an event that was given no tags', () => {
    expect(eventSchema(inRoom, SITE).keywords).toBeUndefined();
  });

  /**
   * An internal event's card is never drawn, because its address would be a
   * way to read the title of something nobody outside the organization is
   * shown.
   */
  it('carries no picture for an event that is not public', () => {
    expect(eventSchema({ ...hosted, is_private: 1 }, SITE).image).toBeUndefined();
  });
});
