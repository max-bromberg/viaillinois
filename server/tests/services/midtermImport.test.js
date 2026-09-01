import { describe, it, expect, vi, beforeEach } from 'vitest';

const rooms = [
  { location_id: 1, building: 'Electrical & Computer Eng Bldg', room_number: '1002', max_capacity: 240 },
];

const allLocations = vi.fn();
const findMidtermsByUid = vi.fn();
const createMidterm = vi.fn();
const updateMidterm = vi.fn();
const getCourseCodes = vi.fn();

vi.mock('../../db/queries/locations.js', () => ({ allLocations: (...a) => allLocations(...a) }));
vi.mock('../../db/queries/midterms.js', () => ({
  findMidtermsByUid: (...a) => findMidtermsByUid(...a),
  createMidterm: (...a) => createMidterm(...a),
  updateMidterm: (...a) => updateMidterm(...a),
}));
vi.mock('../../db/queries/courses.js', () => ({ getCourseCodes: (...a) => getCourseCodes(...a) }));

const { planMidtermImport, applyMidtermImport } = await import('../../services/calendarImport.js');

const calendar = entries => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...entries, 'END:VCALENDAR'].join('\r\n');
const entry = ({ uid = 'm1', summary = 'ECE 210 Midterm 1', location = null }) => [
  'BEGIN:VEVENT', `UID:${uid}`, `SUMMARY:${summary}`,
  'DTSTART:20261001T190000', 'DTEND:20261001T210000',
  ...(location ? [`LOCATION:${location}`] : []), 'END:VEVENT',
];

describe('midterm import', () => {
  beforeEach(() => {
    allLocations.mockResolvedValue(rooms);
    findMidtermsByUid.mockResolvedValue([]);
    getCourseCodes.mockResolvedValue(['ECE 210', 'ECE 220', 'CS 225', 'MATH 286']);
    createMidterm.mockResolvedValue({ insertId: 5 });
    updateMidterm.mockResolvedValue({ affectedRows: 1 });
    createMidterm.mockClear();
    updateMidterm.mockClear();
  });

  /**
   * HKN publishes one calendar for every course, so the course has to be read
   * out of the entry's title. Everything else about the import is the same as
   * for events.
   */
  it('reads the course code out of the title', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({})) });
    expect(plan.entries[0]).toMatchObject({ course_code: 'ECE 210', title: 'ECE 210 Midterm 1' });
  });

  it('reads a course code written without a space', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ summary: 'ECE220 Exam 2' })) });
    expect(plan.entries[0].course_code).toBe('ECE 220');
  });

  it('reads a course code from the middle of a title', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ summary: 'Midterm 1 for CS 225' })) });
    expect(plan.entries[0].course_code).toBe('CS 225');
  });

  it('skips an entry naming a course VIA does not know', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ summary: 'BADM 300 Midterm' })) });
    expect(plan.entries).toHaveLength(0);
    expect(plan.unmatched).toEqual(['BADM 300 Midterm']);
  });

  it('skips an entry with no course code in the title at all', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ summary: 'Reading day' })) });
    expect(plan.entries).toHaveLength(0);
    expect(plan.unmatched).toEqual(['Reading day']);
  });

  /** HKN is the authority, so what it publishes is confirmed, not pending. */
  it('marks what it imports as confirmed', async () => {
    await applyMidtermImport({ ics: calendar(entry({})) });
    expect(createMidterm).toHaveBeenCalledWith(expect.objectContaining({
      status: 'Confirmed', submitted_by: null, external_uid: 'm1',
    }));
  });

  it('resolves a room and keeps the text', async () => {
    const plan = await planMidtermImport({ ics: calendar(entry({ location: 'ECEB 1002' })) });
    expect(plan.entries[0]).toMatchObject({ location_id: 1, location_text: 'ECEB 1002' });
  });

  it('updates rather than duplicates on a second import', async () => {
    findMidtermsByUid.mockResolvedValue([{ midterm_id: 9, external_uid: 'm1' }]);
    const result = await applyMidtermImport({ ics: calendar(entry({})) });
    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(createMidterm).not.toHaveBeenCalled();
  });

  /**
   * An admin can cancel an imported midterm, or fix a room the resolver got
   * wrong. Re-importing the same file must not quietly undo that, so an update
   * leaves the status alone. Only a new midterm is marked confirmed.
   */
  it('leaves the status alone when updating an existing midterm', async () => {
    findMidtermsByUid.mockResolvedValue([{ midterm_id: 9, external_uid: 'm1' }]);
    await applyMidtermImport({ ics: calendar(entry({})) });
    expect(updateMidterm).toHaveBeenCalledWith(9, expect.not.objectContaining({ status: expect.anything() }));
  });

  it('changes nothing when only planning', async () => {
    await planMidtermImport({ ics: calendar(entry({})) });
    expect(createMidterm).not.toHaveBeenCalled();
    expect(updateMidterm).not.toHaveBeenCalled();
  });
});
