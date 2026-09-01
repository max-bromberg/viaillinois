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
