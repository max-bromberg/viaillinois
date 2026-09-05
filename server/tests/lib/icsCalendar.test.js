import { describe, it, expect } from 'vitest';
import { buildCalendar } from '../../lib/ics.js';

/**
 * The writing side of the same file format the importer reads. One event goes
 * out as a calendar file that a phone can subscribe to, so the times have to
 * name the campus zone and the text has to survive the escaping rules.
 */
const EVENT = {
  event_id: 10,
  title: 'General meeting',
  description: 'Bring a laptop, and a friend.',
  start_time: '2026-09-10 18:00:00',
  end_time: '2026-09-10 19:00:00',
  building: 'Electrical & Computer Eng Bldg',
  room_number: '1002',
  location_text: null,
  location_note: null,
  cancelled_at: null,
};

const lines = text => text.split('\r\n');

describe('buildCalendar()', () => {
  it('wraps the events in one calendar with a product identifier', () => {
    const text = buildCalendar([EVENT], { stamp: '2026-09-05 12:00:00' });
    expect(lines(text)[0]).toBe('BEGIN:VCALENDAR');
    expect(text).toContain('VERSION:2.0');
    expect(text).toContain('PRODID:-//VIA//Virtually Integrated Agenda//EN');
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('names the campus zone on both ends of the event', () => {
    const text = buildCalendar([EVENT], { stamp: '2026-09-05 12:00:00' });
    expect(text).toContain('DTSTART;TZID=America/Chicago:20260910T180000');
    expect(text).toContain('DTEND;TZID=America/Chicago:20260910T190000');
  });

  it('gives every event an identifier that survives a second subscription', () => {
    const text = buildCalendar([EVENT], { stamp: '2026-09-05 12:00:00' });
    expect(text).toContain('UID:via-event-10@viaillinois.com');
  });

  it('writes the room as the location, with the note beside it', () => {
    const text = buildCalendar([{ ...EVENT, location_note: 'Use the north entrance.' }],
      { stamp: '2026-09-05 12:00:00' });
    expect(text).toContain('LOCATION:Electrical & Computer Eng Bldg 1002 (Use the north entrance.)');
  });

  it('falls back to the free text location when there is no room', () => {
    const text = buildCalendar([{ ...EVENT, building: null, room_number: null, location_text: 'Zoom' }],
      { stamp: '2026-09-05 12:00:00' });
    expect(text).toContain('LOCATION:Zoom');
  });

  it('escapes the characters the format reserves', () => {
    const text = buildCalendar([{ ...EVENT, title: 'Talk; on C, and \\ things', description: 'Line one\nLine two' }],
      { stamp: '2026-09-05 12:00:00' });
    expect(text).toContain('SUMMARY:Talk\\; on C\\, and \\\\ things');
    expect(text).toContain('DESCRIPTION:Line one\\nLine two');
  });

  it('says when an event was called off rather than leaving it looking normal', () => {
    const text = buildCalendar([{ ...EVENT, cancelled_at: '2026-09-05 09:00:00' }],
      { stamp: '2026-09-05 12:00:00' });
    expect(text).toContain('STATUS:CANCELLED');
    expect(buildCalendar([EVENT], { stamp: '2026-09-05 12:00:00' })).toContain('STATUS:CONFIRMED');
  });

  it('stamps the file with the moment it was written, in UTC', () => {
    const text = buildCalendar([EVENT], { stamp: '2026-09-05 12:00:00' });
    expect(text).toContain('DTSTAMP:20260905T170000Z');
  });

  it('folds a line longer than the format allows', () => {
    const text = buildCalendar([{ ...EVENT, title: 'x'.repeat(200) }], { stamp: '2026-09-05 12:00:00' });
    for (const line of lines(text)) expect(line.length).toBeLessThanOrEqual(75);
  });
});
