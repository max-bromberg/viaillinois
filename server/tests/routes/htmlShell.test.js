import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const getPublicEvents = vi.fn();
const getEventById = vi.fn();

vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: (...a) => getPublicEvents(...a),
  getEventById: (...a) => getEventById(...a),
  countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), findEventsByUid: vi.fn(), createEvent: vi.fn(),
}));
vi.mock('../../db/queries/midterms.js', () => ({ getConfirmedMidterms: vi.fn().mockResolvedValue([]) }));

// A stand in for the built client, so the handler has a shell to fill in.
const dist = mkdtempSync(join(tmpdir(), 'via-dist-'));
writeFileSync(join(dist, 'index.html'), `<!doctype html>
<html lang="en"><head>
<title>VIA: Virtually Integrated Agenda</title>
<meta name="description" content="Original." />
<meta name="robots" content="index, follow" />
</head><body><div id="app"></div></body></html>`);

process.env.CLIENT_URL = 'http://viaillinois.test';
const { createHtmlShellHandler } = await import('../../middleware/htmlShell.js');
const express = (await import('express')).default;

const app = express();
app.get('/{*path}', createHtmlShellHandler(dist));

const EVENT = {
  event_id: 12, title: 'PCB Design Workshop', description: 'Lay out a board.',
  start_time: '2026-10-01 18:00:00', end_time: '2026-10-01 20:00:00',
  rso_name: 'HKN', building: 'Electrical & Computer Eng Bldg', room_number: '1002',
  location_text: null, is_private: 0,
};

describe('the served HTML', () => {
  beforeEach(() => {
    getPublicEvents.mockResolvedValue([EVENT]);
    getEventById.mockResolvedValue(EVENT);
  });

  /**
   * The whole point. Every address used to return the same empty document, so
   * a crawler that does not run scripts saw one untitled site with no content.
   */
  it('titles an event page after the event', async () => {
    const res = await request(app).get('/events/12');
    expect(res.text).toContain('<title>PCB Design Workshop by HKN: VIA</title>');
  });

  it('puts the event in the body, where it can be read without scripts', async () => {
    const res = await request(app).get('/events/12');
    expect(res.text).toContain('<h1>PCB Design Workshop</h1>');
    expect(res.text).toContain('Electrical &amp; Computer Eng Bldg 1002');
  });

  it('publishes the event as structured data', async () => {
    const res = await request(app).get('/events/12');
    expect(res.text).toContain('application/ld+json');
    expect(res.text).toContain('"@type":"Event"');
    expect(res.text).toContain('2026-10-01T18:00:00-05:00');
  });

  it('links every event from the front page so they can be found', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('href="/events/12"');
  });

  it('states one canonical address per page', async () => {
    const res = await request(app).get('/events/12');
    expect(res.text).toContain('<link rel="canonical" href="http://viaillinois.test/events/12"');
  });

  it('keeps a private event out of the index and out of the HTML', async () => {
    getEventById.mockResolvedValue({ ...EVENT, is_private: 1 });
    const res = await request(app).get('/events/12');
    expect(res.text).toContain('noindex');
    expect(res.text).not.toContain('PCB Design Workshop');
  });

  it('keeps the signed in areas out of the index', async () => {
    expect((await request(app).get('/dashboard')).text).toContain('noindex');
  });

  /** A title written by an RSO admin is untrusted input by the time it is here. */
  it('escapes an event title rather than letting it write HTML', async () => {
    getEventById.mockResolvedValue({ ...EVENT, title: '<img src=x onerror=alert(1)>' });
    const res = await request(app).get('/events/12');
    expect(res.text).not.toContain('<img src=x onerror=alert(1)>');
    expect(res.text).toContain('&lt;img');
  });

  it('still serves the page when the database is unavailable', async () => {
    getEventById.mockRejectedValue(new Error('database is down'));
    const res = await request(app).get('/events/12');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });

  it('serves the untouched shell for an address it does not describe', async () => {
    const res = await request(app).get('/anything-else');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app">');
  });
});
