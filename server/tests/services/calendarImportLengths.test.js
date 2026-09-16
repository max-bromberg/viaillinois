import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/queries/outbox.ts', async () =>
  (await import('../support/outboxMock.js')).outboxMock());

/**
 * A calendar file is written by somebody else's software, and the columns it
 * lands in are bounded: Events.title and Midterms.title hold 200 characters,
 * location_text holds 200, external_uid holds 255. Nothing between the file and
 * the insert checked any of them, and MySQL runs in strict mode, so a value
 * over its column's width is error 1406 rather than a truncation.
 *
 * That failure lands in the middle of a loop that has already written the rows
 * before it, and the driver's message does not match the pattern the controller
 * turns into a 400, so the admin is told nothing beyond a 500 and is left with
 * a half imported term.
 *
 * None of this is exotic. Exchange and Outlook write identifiers well past two
 * hundred characters, and the import panel tells people to export from Outlook.
 */

const rooms = [{ location_id: 1, building: 'Electrical & Computer Eng Bldg', room_number: '1002' }];

const allLocations = vi.fn();
const findMidtermsByUid = vi.fn();
const createMidterm = vi.fn();
const updateMidterm = vi.fn();
const getCourseCodes = vi.fn();
const findEventsByUid = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const findSeriesByUid = vi.fn();

vi.mock('../../db/queries/locations.js', () => ({ allLocations: (...a) => allLocations(...a) }));
vi.mock('../../db/queries/midterms.js', () => ({
  findMidtermsByUid: (...a) => findMidtermsByUid(...a),
  createMidterm: (...a) => createMidterm(...a),
  updateMidterm: (...a) => updateMidterm(...a),
}));
vi.mock('../../db/queries/courses.js', () => ({ getCourseCodes: (...a) => getCourseCodes(...a) }));
vi.mock('../../db/queries/events.js', () => ({
  findEventsByUid: (...a) => findEventsByUid(...a),
  createEvent: (...a) => createEvent(...a),
  updateEvent: (...a) => updateEvent(...a),
  deleteEvent: (...a) => deleteEvent(...a),
}));
vi.mock('../../db/queries/eventSeries.js', () => ({
  findSeriesByUid: (...a) => findSeriesByUid(...a),
  createSeriesWithOccurrences: vi.fn(),
  updateSeriesRule: vi.fn(),
  occurrencesOfSeries: vi.fn(),
}));

const { planMidtermImport, planEventImport } = await import('../../services/calendarImport.js');

/** The widths the schema gives these columns. */
const TITLE = 200;
const LOCATION_TEXT = 200;
const EXTERNAL_UID = 255;

const calendar = lines => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
const entry = ({ uid = 'e1', summary = 'ECE 210 Midterm 1', location = null }) => [
  'BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${summary}`,
  'DTSTART:20261001T190000', 'DTEND:20261001T210000',
  ...(location ? [`LOCATION:${location}`] : []), 'END:VEVENT',
];

/** An Exchange style identifier, which is how these get long in the wild. */
const longUid = '040000008200E00074C5B7101A82E008' + 'A7D5D801'.repeat(40);
const longTitle = `ECE 210 Midterm 1, ${'conflict exam details '.repeat(20)}`;
const longLocation = `Room 1002, ${'Electrical and Computer Engineering Building, '.repeat(6)}`;

beforeEach(() => {
  allLocations.mockResolvedValue(rooms);
  findMidtermsByUid.mockResolvedValue([]);
  findEventsByUid.mockResolvedValue([]);
  findSeriesByUid.mockResolvedValue([]);
  getCourseCodes.mockResolvedValue(['ECE 210']);
  createMidterm.mockResolvedValue({ insertId: 5 });
  updateMidterm.mockResolvedValue({ affectedRows: 1 });
});

describe('a midterm import keeps every value inside its column', () => {
  it('bounds a title longer than the column holds', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ summary: longTitle })) });
    expect(longTitle.length).toBeGreaterThan(TITLE);
    expect(plan.entries[0].title.length).toBeLessThanOrEqual(TITLE);
  });

  it('keeps the start of a title, which is the part naming the course', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ summary: longTitle })) });
    expect(plan.entries[0].title.startsWith('ECE 210 Midterm 1')).toBe(true);
    expect(plan.entries[0].course_code).toBe('ECE 210');
  });

  it('bounds a location longer than the column holds', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ location: longLocation })) });
    expect(longLocation.length).toBeGreaterThan(LOCATION_TEXT);
    expect(plan.entries[0].location_text.length).toBeLessThanOrEqual(LOCATION_TEXT);
  });

  it('bounds an identifier longer than the column holds', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ uid: longUid })) });
    expect(longUid.length).toBeGreaterThan(EXTERNAL_UID);
    expect(plan.entries[0].external_uid.length).toBeLessThanOrEqual(EXTERNAL_UID);
  });

  /**
   * The identifier is what a re-import matches on, so whatever stands in for a
   * long one has to be the same every time that file is imported, and it has to
   * differ between two entries that differ only past the point a truncation
   * would have cut.
   */
  it('stands in for a long identifier with one that is stable', async () => {
    const once = await planMidtermImport({ ics: calendar(entry({ uid: longUid })) });
    const again = await planMidtermImport({ ics: calendar(entry({ uid: longUid })) });
    expect(once.entries[0].external_uid).toBe(again.entries[0].external_uid);
  });

  it('tells two long identifiers apart when they differ only at the end', async () => {
    const first = await planMidtermImport({ ics: calendar(entry({ uid: `${longUid}-one` })) });
    const second = await planMidtermImport({ ics: calendar(entry({ uid: `${longUid}-two` })) });
    expect(first.entries[0].external_uid).not.toBe(second.entries[0].external_uid);
  });

  it('leaves a value that already fits exactly as it was', async () => {
    const plan = await planMidtermImport({
      ics: calendar(entry({ uid: 'm1', summary: 'ECE 210 Midterm 1', location: 'ECEB 1002' })),
    });
    expect(plan.entries[0]).toMatchObject({
      external_uid: 'm1', title: 'ECE 210 Midterm 1', location_text: 'ECEB 1002',
    });
  });
});

/**
 * The event importer writes the same three columns from the same untrusted
 * file, so it is held to the same bound. Fixing one and leaving the other is
 * leaving the bug where the larger calendars are.
 */
describe('an event import keeps every value inside its column', () => {
  it('bounds the title, the location and the identifier', async () => {
    const plan = await planEventImport({
      ics: calendar(entry({ uid: longUid, summary: longTitle, location: longLocation })),
      rsoId: 1,
    });
    expect(plan.entries[0].title.length).toBeLessThanOrEqual(TITLE);
    expect(plan.entries[0].location_text.length).toBeLessThanOrEqual(LOCATION_TEXT);
    expect(plan.entries[0].external_uid.length).toBeLessThanOrEqual(EXTERNAL_UID);
  });

  /**
   * One week of a series carries the entry's identifier and its date, so the
   * identifier has to be bounded before the date is added to it rather than
   * after, or the occurrence key is over the column again.
   */
  it('bounds the identifier each week of a series carries', async () => {
    const plan = await planEventImport({
      ics: calendar([
        'BEGIN:VEVENT', `UID:${longUid}`, 'SUMMARY:Weekly meeting',
        'DTSTART:20261001T190000', 'DTEND:20261001T210000',
        'RRULE:FREQ=WEEKLY;COUNT=3', 'END:VEVENT',
      ]),
      rsoId: 1,
    });
    for (const row of plan.entries[0].occurrence_rows ?? []) {
      expect(row.external_uid.length).toBeLessThanOrEqual(EXTERNAL_UID);
    }
    expect(plan.entries[0].external_uid.length).toBeLessThanOrEqual(EXTERNAL_UID);
  });
});
