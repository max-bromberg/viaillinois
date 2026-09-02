import { describe, it, expect } from 'vitest';
import { parseCalendar } from '../../lib/ics.js';

const wrap = body => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//EN\r\n${body}\r\nEND:VCALENDAR\r\n`;

const EVENT = wrap([
  'BEGIN:VEVENT',
  'UID:abc-123@hkn.illinois.edu',
  'SUMMARY:ECE 210 Midterm 1',
  'DTSTART;TZID=America/Chicago:20261001T190000',
  'DTEND;TZID=America/Chicago:20261001T210000',
  'LOCATION:ECEB 1002',
  'DESCRIPTION:Bring a calculator',
  'END:VEVENT',
].join('\r\n'));

describe('parseCalendar', () => {
  it('reads the fields of an entry', () => {
    const [entry] = parseCalendar(EVENT);
    expect(entry).toEqual({
      uid: 'abc-123@hkn.illinois.edu',
      title: 'ECE 210 Midterm 1',
      description: 'Bring a calculator',
      location: 'ECEB 1002',
      start: '2026-10-01 19:00:00',
      end: '2026-10-01 21:00:00',
      allDay: false,
      rrule: null,
      exdates: [],
      recurrenceId: null,
    });
  });

  /**
   * A repeating entry used to be imported as its first occurrence and nothing
   * else. The reader now carries the rule out, and the importer expands it.
   */
  describe('a repeating entry', () => {
    const repeating = lines => parseCalendar(wrap([
      'BEGIN:VEVENT',
      'UID:weekly@ieee',
      'SUMMARY:Weekly meeting',
      'DTSTART:20260901T180000',
      'DTEND:20260901T190000',
      ...lines,
      'END:VEVENT',
    ].join('\r\n')))[0];

    it('carries the rule out as it was written', () => {
      expect(repeating(['RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8']).rrule).toBe('FREQ=WEEKLY;BYDAY=TU;COUNT=8');
    });

    it('reads the dates the rule leaves out, however they are written', () => {
      const entry = repeating([
        'RRULE:FREQ=WEEKLY;BYDAY=TU',
        'EXDATE;TZID=America/Chicago:20260908T180000,20260915T180000',
        'EXDATE;VALUE=DATE:20260922',
      ]);
      expect(entry.exdates).toEqual(['2026-09-08 18:00:00', '2026-09-15 18:00:00', '2026-09-22 00:00:00']);
    });

    /**
     * One week of a series moved or renamed is exported as its own entry,
     * carrying the parent identifier and the date it stands in for.
     */
    it('reads the date an overriding entry stands in for', () => {
      expect(repeating(['RECURRENCE-ID:20260915T180000']).recurrenceId).toBe('2026-09-15 18:00:00');
    });

    it('says nothing about a rule when the entry has none', () => {
      const entry = repeating([]);
      expect(entry.rrule).toBeNull();
      expect(entry.exdates).toEqual([]);
      expect(entry.recurrenceId).toBeNull();
    });
  });

  it('reads several entries', () => {
    const two = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:One',
      'DTSTART:20261001T190000', 'DTEND:20261001T200000', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:2', 'SUMMARY:Two',
      'DTSTART:20261002T190000', 'DTEND:20261002T200000', 'END:VEVENT',
    ].join('\r\n'));
    expect(parseCalendar(two).map(e => e.title)).toEqual(['One', 'Two']);
  });

  /**
   * A line longer than 75 octets is split across lines, with each continuation
   * starting with a space or a tab. Reassembling them is not optional: a title
   * or a location can easily run past that and would otherwise be truncated.
   */
  it('rejoins folded lines', () => {
    const folded = wrap([
      'BEGIN:VEVENT', 'UID:1',
      'SUMMARY:A title long enough that a calendar program would',
      '  split it across two lines',
      'DTSTART:20261001T190000', 'DTEND:20261001T200000', 'END:VEVENT',
    ].join('\r\n'));
    expect(parseCalendar(folded)[0].title)
      .toBe('A title long enough that a calendar program would split it across two lines');
  });

  /**
   * RFC 5545 escapes are undone in a single pass. Doing it as a series of
   * replacements gets the order wrong: an escaped backslash followed by the
   * letter n is the two characters a person typed, not a line break.
   */
  it('unescapes an escaped semicolon', () => {
    const escaped = wrap([
      'BEGIN:VEVENT', 'UID:1',
      String.raw`SUMMARY:ECE 210 Midterm\; Room A`,
      'DTSTART:20261001T190000', 'DTEND:20261001T200000', 'END:VEVENT',
    ].join('\r\n'));
    expect(parseCalendar(escaped)[0].title).toBe('ECE 210 Midterm; Room A');
  });

  it('leaves an escaped backslash followed by n as those two characters', () => {
    const escaped = wrap([
      'BEGIN:VEVENT', 'UID:1',
      String.raw`SUMMARY:A path C:\\next`,
      'DTSTART:20261001T190000', 'DTEND:20261001T200000', 'END:VEVENT',
    ].join('\r\n'));
    expect(parseCalendar(escaped)[0].title).toBe(String.raw`A path C:\next`);
  });

  it('unescapes commas, semicolons, backslashes and newlines', () => {
    const escaped = wrap([
      'BEGIN:VEVENT', 'UID:1',
      'SUMMARY:Food\\, drink\; and a backslash \\\\',
      'DESCRIPTION:First line\\nSecond line',
      'DTSTART:20261001T190000', 'DTEND:20261001T200000', 'END:VEVENT',
    ].join('\r\n'));
    const [entry] = parseCalendar(escaped);
    expect(entry.title).toBe('Food, drink; and a backslash \\');
    expect(entry.description).toBe('First line\nSecond line');
  });

  /** UTC times are converted to Champaign local time, which is what VIA stores. */
  it('converts a UTC time to local time in central daylight time', () => {
    const utc = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Noon UTC in July',
      'DTSTART:20260715T170000Z', 'DTEND:20260715T180000Z', 'END:VEVENT',
    ].join('\r\n'));
    const [entry] = parseCalendar(utc);
    expect(entry.start).toBe('2026-07-15 12:00:00');
    expect(entry.end).toBe('2026-07-15 13:00:00');
  });

  it('converts a UTC time to local time in central standard time', () => {
    const utc = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Noon UTC in January',
      'DTSTART:20260115T180000Z', 'DTEND:20260115T190000Z', 'END:VEVENT',
    ].join('\r\n'));
    expect(parseCalendar(utc)[0].start).toBe('2026-01-15 12:00:00');
  });

  it('treats an all day entry as covering the whole day', () => {
    const allDay = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Reading day',
      'DTSTART;VALUE=DATE:20261012', 'DTEND;VALUE=DATE:20261013', 'END:VEVENT',
    ].join('\r\n'));
    const [entry] = parseCalendar(allDay);
    expect(entry.start).toBe('2026-10-12 00:00:00');
    expect(entry.end).toBe('2026-10-12 23:59:00');
    expect(entry.allDay).toBe(true);
  });

  it('gives an entry with no end time a one hour duration', () => {
    const noEnd = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Open ended',
      'DTSTART:20261001T190000', 'END:VEVENT',
    ].join('\r\n'));
    expect(parseCalendar(noEnd)[0].end).toBe('2026-10-01 20:00:00');
  });

  /**
   * An all day entry's DTEND is exclusive, so a single day is often written
   * with the same date twice. Rolling that back a minute would put the end
   * before the start, which the database check constraint rejects and which
   * would abort an import partway through.
   */
  it('handles a single all day entry written with the same start and end date', () => {
    const sameDay = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Reading day',
      'DTSTART;VALUE=DATE:20260401', 'DTEND;VALUE=DATE:20260401', 'END:VEVENT',
    ].join('\r\n'));
    const [entry] = parseCalendar(sameDay);
    expect(entry.start).toBe('2026-04-01 00:00:00');
    expect(entry.end).toBe('2026-04-01 23:59:00');
  });

  it('gives a zero length entry a duration rather than an end at its start', () => {
    const zero = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Instant',
      'DTSTART:20261001T190000', 'DTEND:20261001T190000', 'END:VEVENT',
    ].join('\r\n'));
    const [entry] = parseCalendar(zero);
    expect(new Date(entry.end.replace(' ', 'T')) > new Date(entry.start.replace(' ', 'T'))).toBe(true);
  });

  it('repairs an entry whose end is before its start', () => {
    const backwards = wrap([
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Backwards',
      'DTSTART:20261001T190000', 'DTEND:20261001T180000', 'END:VEVENT',
    ].join('\r\n'));
    const [entry] = parseCalendar(backwards);
    expect(entry.end).toBe('2026-10-01 20:00:00');
  });

  it('skips an entry with no start time, which cannot be scheduled', () => {
    const noStart = wrap(['BEGIN:VEVENT', 'UID:1', 'SUMMARY:When?', 'END:VEVENT'].join('\r\n'));
    expect(parseCalendar(noStart)).toEqual([]);
  });

  it('skips an entry with no title, which would show as blank', () => {
    const noTitle = wrap([
      'BEGIN:VEVENT', 'UID:1', 'DTSTART:20261001T190000', 'END:VEVENT',
    ].join('\r\n'));
    expect(parseCalendar(noTitle)).toEqual([]);
  });

  it('ignores anything that is not an event, such as alarms and timezones', () => {
    const withAlarm = wrap([
      'BEGIN:VTIMEZONE', 'TZID:America/Chicago', 'END:VTIMEZONE',
      'BEGIN:VEVENT', 'UID:1', 'SUMMARY:Real', 'DTSTART:20261001T190000', 'DTEND:20261001T200000',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', 'END:VALARM',
      'END:VEVENT',
    ].join('\r\n'));
    const entries = parseCalendar(withAlarm);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Real');
  });

  it('accepts a file with unix line endings, which text editors produce', () => {
    expect(parseCalendar(EVENT.replace(/\r\n/g, '\n'))[0].title).toBe('ECE 210 Midterm 1');
  });

  it('returns nothing for text that is not a calendar', () => {
    expect(parseCalendar('hello')).toEqual([]);
    expect(parseCalendar('')).toEqual([]);
  });

  it('falls back to a stable identifier when an entry has no UID', () => {
    const noUid = wrap([
      'BEGIN:VEVENT', 'SUMMARY:Anonymous', 'DTSTART:20261001T190000', 'DTEND:20261001T200000', 'END:VEVENT',
    ].join('\r\n'));
    const first = parseCalendar(noUid)[0].uid;
    const second = parseCalendar(noUid)[0].uid;
    expect(first).toBeTruthy();
    expect(first).toBe(second);
  });
});
