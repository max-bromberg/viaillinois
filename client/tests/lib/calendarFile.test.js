import { describe, it, expect } from 'vitest';
import { escapeCalendarText, calendarFileFor } from '../../src/lib/calendarFile.js';

/**
 * The calendar file a reader downloads from an event page.
 *
 * A calendar file is a line based format, so a line break inside a value has to
 * be escaped or it becomes a new property. The escaping handled a line feed, and
 * a carriage return followed by one, but not a lone carriage return, and plenty
 * of readers split on that. A board member can put one in an event title, so a
 * student who added that event to their calendar would have taken whatever the
 * title carried after it into their own calendar as forged entries. The same
 * gap was in the server's writer, and both are closed.
 */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

const EVENT = {
  event_id: 3,
  title: 'General meeting',
  rso_name: 'IEEE',
  start_time: '2026-09-10T18:00:00-05:00',
  end_time: '2026-09-10T19:00:00-05:00',
  building: 'ECEB',
  room_number: '1002',
};

const fileFor = event => calendarFileFor(event, {
  url: 'https://viaillinois.com/events/3',
  now: new Date('2026-09-05T12:00:00Z'),
});

describe('escaping a value', () => {
  it.each([
    ['a line feed', LF],
    ['a carriage return and a line feed', CR + LF],
    ['a lone carriage return', CR],
  ])('turns %s into an escaped break', (_, breakChar) => {
    const escaped = escapeCalendarText(`Study${breakChar}session`);
    expect(escaped).toBe('Study\\nsession');
  });

  it('escapes the characters the format reserves', () => {
    expect(escapeCalendarText('a;b,c\\d')).toBe('a\\;b\\,c\\\\d');
  });

  it('drops the control characters the format cannot carry', () => {
    expect(escapeCalendarText(`a${String.fromCharCode(0)}b${String.fromCharCode(7)}`)).toBe('ab');
  });

  it('reads a missing value as an empty one rather than as the word undefined', () => {
    expect(escapeCalendarText(null)).toBe('');
    expect(escapeCalendarText(undefined)).toBe('');
  });
});

describe('the file', () => {
  it('carries the event', () => {
    const text = fileFor(EVENT);
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('SUMMARY:General meeting');
    expect(text).toContain('LOCATION:ECEB 1002');
    expect(text).toContain('UID:via-event-3@viaillinois.com');
    expect(text).toContain('URL:https://viaillinois.com/events/3');
  });

  it('does not let a forged event reach the file', () => {
    const text = fileFor({
      ...EVENT,
      title: `Study${CR}END:VEVENT${CR}BEGIN:VEVENT${CR}UID:forged@example.com`,
    });
    // The words are still in the title, escaped, which is harmless. What must
    // not happen is any of them becoming a line of its own.
    const lines = text.split(CR + LF);
    expect(lines.filter(line => line === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines.filter(line => line === 'END:VEVENT')).toHaveLength(1);
    expect(lines.filter(line => line.startsWith('UID:forged'))).toHaveLength(0);
  });

  it('leaves out the end time when nobody said when it ends', () => {
    expect(fileFor({ ...EVENT, end_time: null })).not.toContain('DTEND:');
  });

  it('ends every line the way the format asks', () => {
    const text = fileFor(EVENT);
    expect(text.split(CR + LF).length).toBeGreaterThan(8);
    expect(text.split(LF).filter(line => line !== '' && !line.endsWith(CR))).toHaveLength(1);
  });
});
