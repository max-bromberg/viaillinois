import { describe, it, expect } from 'vitest';
import { POSTER_HEIGHT, POSTER_WIDTH } from '../../../src/lib/poster/document.js';
import { TEMPLATES, posterFrom } from '../../../src/lib/poster/templates.js';

/**
 * The templates a design starts from.
 *
 * A free canvas with nothing on it is the honest answer to "give me more
 * flexibility" and the wrong one to give somebody who has twenty minutes and a
 * meeting on Thursday. A template is a document like any other, already filled
 * in with the event, so the quick path to a decent poster stays one click away
 * and nothing on it is fixed: every piece a template lays down can be moved,
 * restyled or taken off, because a template is only a stack of ordinary layers.
 */
const EVENT = {
  event_id: 41,
  title: 'Soldering night',
  description: 'Bring a project, or use one of ours.',
  start_time: '2026-09-24T18:00:00-05:00',
  end_time: '2026-09-24T20:00:00-05:00',
  building: 'Electrical & Computer Eng Bldg',
  room_number: '3017',
  tags: 'workshop,hardware',
  rso_name: 'IEEE',
};

const RSO = { rso_id: 3, name: 'IEEE' };

const build = key => posterFrom(key, {
  event: EVENT,
  rso: RSO,
  accent: '#007c80',
  eventUrl: 'https://viaillinois.com/events/41',
});

describe('the templates', () => {
  it('offers more than one, each with a name a board would recognise', () => {
    expect(TEMPLATES.length).toBeGreaterThan(1);
    for (const template of TEMPLATES) {
      expect(template.key).toBeTruthy();
      expect(template.name).toBeTruthy();
    }
  });

  it.each(TEMPLATES.map(template => template.key))('%s lays out a whole poster', key => {
    const poster = build(key);
    expect(poster.width).toBe(POSTER_WIDTH);
    expect(poster.height).toBe(POSTER_HEIGHT);
    expect(poster.layers.length).toBeGreaterThan(2);
  });

  it.each(TEMPLATES.map(template => template.key))('%s says what the event is', key => {
    const words = build(key).layers
      .filter(layer => layer.kind === 'text')
      .map(layer => layer.text)
      .join(' ');
    expect(words).toContain('Soldering night');
    expect(words).toContain('IEEE');
  });

  it.each(TEMPLATES.map(template => template.key))('%s says when and where it is', key => {
    const words = build(key).layers
      .filter(layer => layer.kind === 'text')
      .map(layer => layer.text)
      .join(' ');
    expect(words).toContain('6:00 PM');
    expect(words).toContain('3017');
  });

  it.each(TEMPLATES.map(template => template.key))('%s carries the link square', key => {
    const square = build(key).layers.find(layer => layer.kind === 'qr');
    expect(square.href).toBe('https://viaillinois.com/events/41');
  });

  it.each(TEMPLATES.map(template => template.key))('%s keeps every layer on the poster', key => {
    for (const layer of build(key).layers) {
      expect(layer.x).toBeGreaterThanOrEqual(0);
      expect(layer.y).toBeGreaterThanOrEqual(0);
      expect(layer.x + layer.width).toBeLessThanOrEqual(POSTER_WIDTH);
      expect(layer.y + layer.height).toBeLessThanOrEqual(POSTER_HEIGHT);
    }
  });

  /** Nothing a template lays down is special: it is all ordinary layers. */
  it.each(TEMPLATES.map(template => template.key))('%s lays down nothing a board cannot move', key => {
    for (const layer of build(key).layers) {
      expect(layer.locked).toBeUndefined();
      expect(['text', 'image', 'shape', 'qr']).toContain(layer.kind);
    }
  });

  it('draws in the colour the organization was given, wherever the accent is used', () => {
    const poster = posterFrom('banner', {
      event: EVENT, rso: RSO, accent: '#b5306f', eventUrl: 'https://viaillinois.com/events/41',
    });
    const colours = poster.layers.map(layer => layer.fill ?? layer.color);
    expect(colours).toContain('#b5306f');
  });

  it('leaves out what the event does not have, rather than writing an empty line', () => {
    const bare = posterFrom('banner', {
      event: { ...EVENT, description: null, building: null, room_number: null, tags: '' },
      rso: RSO,
      accent: '#007c80',
      eventUrl: 'https://viaillinois.com/events/41',
    });
    for (const layer of bare.layers.filter(one => one.kind === 'text')) {
      expect(layer.text.trim()).not.toBe('');
    }
  });

  it('falls back to the first template when it is handed a name it does not know', () => {
    expect(posterFrom('nothing like that', {
      event: EVENT, rso: RSO, accent: '#007c80', eventUrl: 'https://viaillinois.com/events/41',
    }).layers.length).toBeGreaterThan(2);
  });
});
