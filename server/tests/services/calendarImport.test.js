import { describe, it, expect, vi, beforeEach } from 'vitest';

const rooms = [
  { location_id: 1, building: 'Electrical & Computer Eng Bldg', room_number: '1002', max_capacity: 240 },
];

const allLocations = vi.fn();
const findEventsByUid = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();

vi.mock('../../db/queries/locations.js', () => ({ allLocations: (...a) => allLocations(...a) }));
vi.mock('../../db/queries/events.js', () => ({
  findEventsByUid: (...a) => findEventsByUid(...a),
  createEvent: (...a) => createEvent(...a),
  updateEvent: (...a) => updateEvent(...a),
}));

const { planEventImport, applyEventImport } = await import('../../services/calendarImport.js');

const calendar = entries => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...entries, 'END:VCALENDAR'].join('\r\n');

const entry = ({ uid = 'u1', summary = 'Weekly meeting', location = null, start = '20261001T180000', end = '20261001T190000' }) => [
  'BEGIN:VEVENT',
  `UID:${uid}`,
  `SUMMARY:${summary}`,
  `DTSTART:${start}`,
  `DTEND:${end}`,
  ...(location ? [`LOCATION:${location}`] : []),
  'END:VEVENT',
];

describe('calendar import', () => {
  beforeEach(() => {
    allLocations.mockResolvedValue(rooms);
    findEventsByUid.mockResolvedValue([]);
    createEvent.mockResolvedValue({ insertId: 10 });
    updateEvent.mockResolvedValue({ affectedRows: 1 });
    createEvent.mockClear();
    updateEvent.mockClear();
  });

  it('plans a new event for an entry that is not there yet', async () => {
    const plan = await planEventImport({ ics: calendar(entry({})), rsoId: 1 });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      action: 'create', title: 'Weekly meeting', start: '2026-10-01 18:00:00',
    });
  });

  it('resolves a location that names a building and a room', async () => {
    const plan = await planEventImport({ ics: calendar(entry({ location: 'ECEB 1002' })), rsoId: 1 });
    expect(plan.entries[0]).toMatchObject({ location_id: 1, location_text: 'ECEB 1002' });
  });

  it('keeps a location that is not a room as text', async () => {
    const plan = await planEventImport({ ics: calendar(entry({ location: 'Zoom' })), rsoId: 1 });
    expect(plan.entries[0]).toMatchObject({ location_id: null, location_text: 'Zoom' });
  });

  it('plans an update for an entry already imported', async () => {
    findEventsByUid.mockResolvedValue([{ event_id: 77, external_uid: 'u1' }]);
    const plan = await planEventImport({ ics: calendar(entry({})), rsoId: 1 });
    expect(plan.entries[0]).toMatchObject({ action: 'update', event_id: 77 });
  });

  it('reports entries the calendar could not supply, rather than dropping them silently', async () => {
    const broken = calendar(['BEGIN:VEVENT', 'UID:x', 'SUMMARY:No time at all', 'END:VEVENT']);
    const plan = await planEventImport({ ics: broken, rsoId: 1 });
    expect(plan.entries).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it('changes nothing when only planning', async () => {
    await planEventImport({ ics: calendar(entry({})), rsoId: 1 });
    expect(createEvent).not.toHaveBeenCalled();
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('creates the events when applied', async () => {
    const result = await applyEventImport({ ics: calendar(entry({})), rsoId: 1, createdBy: 'tester' });
    expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0 });
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      rso_id: 1, created_by: 'tester', external_uid: 'u1', title: 'Weekly meeting',
    }));
  });

  it('updates rather than duplicates on a second import', async () => {
    findEventsByUid.mockResolvedValue([{ event_id: 77, external_uid: 'u1' }]);
    const result = await applyEventImport({ ics: calendar(entry({})), rsoId: 1, createdBy: 'tester' });
    expect(result).toMatchObject({ created: 0, updated: 1 });
    expect(updateEvent).toHaveBeenCalledWith(77, expect.objectContaining({ title: 'Weekly meeting' }));
    expect(createEvent).not.toHaveBeenCalled();
  });

  /**
   * An import must not quietly overwrite what someone typed. Only rows this
   * importer created carry an external identifier, so only those are updated.
   */
  it('never touches an event that was entered by hand', async () => {
    findEventsByUid.mockResolvedValue([]);
    await applyEventImport({ ics: calendar(entry({})), rsoId: 1, createdBy: 'tester' });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  /**
   * A file can name the same entry twice: a recurring event with an override
   * carries the parent UID with a RECURRENCE-ID, and Google exports those
   * routinely. Both would be planned as creates, and the second insert would
   * violate the unique key partway through a loop that has already committed
   * the earlier rows.
   */
  it('imports an entry named twice in one file only once', async () => {
    const twice = calendar([
      ...entry({ uid: 'same', summary: 'First occurrence' }),
      ...entry({ uid: 'same', summary: 'An override of it' }),
    ]);
    const plan = await planEventImport({ ics: twice, rsoId: 1 });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].title).toBe('First occurrence');
    expect(plan.duplicates).toBe(1);
  });

  it('does not insert the duplicate when applied', async () => {
    const twice = calendar([
      ...entry({ uid: 'same', summary: 'One' }),
      ...entry({ uid: 'same', summary: 'Two' }),
    ]);
    const result = await applyEventImport({ ics: twice, rsoId: 1, createdBy: 'tester' });
    expect(result.created).toBe(1);
    expect(createEvent).toHaveBeenCalledTimes(1);
  });

  it('imports several entries at once', async () => {
    const many = calendar([
      ...entry({ uid: 'a', summary: 'One' }),
      ...entry({ uid: 'b', summary: 'Two' }),
      ...entry({ uid: 'c', summary: 'Three' }),
    ]);
    const result = await applyEventImport({ ics: many, rsoId: 1, createdBy: 'tester' });
    expect(result.created).toBe(3);
  });

  /**
   * One request should not be able to ask for unbounded work. A calendar with
   * tens of thousands of entries is a mistake or an attack, not a semester of
   * events, and a thousand is already far more than any RSO publishes.
   */
  it('refuses a calendar with more entries than anyone would publish', async () => {
    const many = calendar(Array.from({ length: 1001 }, (_, i) => entry({ uid: `u${i}` })).flat());
    await expect(planEventImport({ ics: many, rsoId: 1 })).rejects.toThrow(/at most 1000 can be imported at once/i);
  });

  it('accepts a calendar at the limit', async () => {
    const many = calendar(Array.from({ length: 1000 }, (_, i) => entry({ uid: `u${i}` })).flat());
    const plan = await planEventImport({ ics: many, rsoId: 1 });
    expect(plan.entries).toHaveLength(1000);
  });

  it('refuses a file that is not a calendar', async () => {
    await expect(planEventImport({ ics: 'this is not a calendar', rsoId: 1 }))
      .rejects.toThrow(/calendar/i);
  });
});
