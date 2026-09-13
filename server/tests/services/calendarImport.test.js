import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/queries/outbox.ts', async () =>
  (await import('../support/outboxMock.js')).outboxMock());

const rooms = [
  { location_id: 1, building: 'Electrical & Computer Eng Bldg', room_number: '1002', max_capacity: 240 },
];

const allLocations = vi.fn();
const findEventsByUid = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const findSeriesByUid = vi.fn();
const createSeriesWithOccurrences = vi.fn();
const updateSeriesRule = vi.fn();
const occurrencesOfSeries = vi.fn();

vi.mock('../../db/queries/locations.js', () => ({ allLocations: (...a) => allLocations(...a) }));
vi.mock('../../db/queries/events.js', () => ({
  findEventsByUid: (...a) => findEventsByUid(...a),
  createEvent: (...a) => createEvent(...a),
  updateEvent: (...a) => updateEvent(...a),
  deleteEvent: (...a) => deleteEvent(...a),
}));
vi.mock('../../db/queries/eventSeries.js', () => ({
  findSeriesByUid: (...a) => findSeriesByUid(...a),
  createSeriesWithOccurrences: (...a) => createSeriesWithOccurrences(...a),
  updateSeriesRule: (...a) => updateSeriesRule(...a),
  occurrencesOfSeries: (...a) => occurrencesOfSeries(...a),
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
    deleteEvent.mockResolvedValue({ affectedRows: 1 });
    findSeriesByUid.mockResolvedValue([]);
    occurrencesOfSeries.mockResolvedValue([]);
    createSeriesWithOccurrences.mockResolvedValue({ seriesId: 5, eventIds: [1, 2, 3] });
    updateSeriesRule.mockResolvedValue({ affectedRows: 1 });
    createEvent.mockClear();
    updateEvent.mockClear();
    deleteEvent.mockClear();
    createSeriesWithOccurrences.mockClear();
    updateSeriesRule.mockClear();
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

/**
 * A repeating entry used to be imported as its first occurrence and nothing
 * else, which is how a calendar with one weekly meeting in it became one event
 * in the feed and a board that thought it had imported a term.
 */
describe('importing a repeating entry', () => {
  const TERM_END = '2026-12-09';

  const repeating = (rule, extra = []) => calendar([
    'BEGIN:VEVENT',
    'UID:weekly@ieee',
    'SUMMARY:Weekly meeting',
    'DTSTART:20260901T180000',
    'DTEND:20260901T193000',
    `RRULE:${rule}`,
    ...extra,
    'END:VEVENT',
  ]);

  beforeEach(() => {
    allLocations.mockResolvedValue(rooms);
    findEventsByUid.mockResolvedValue([]);
    findSeriesByUid.mockResolvedValue([]);
    occurrencesOfSeries.mockResolvedValue([]);
    createEvent.mockResolvedValue({ insertId: 10 });
    createSeriesWithOccurrences.mockResolvedValue({ seriesId: 5, eventIds: [1, 2, 3] });
    createEvent.mockClear();
    updateEvent.mockClear();
    deleteEvent.mockClear();
    createSeriesWithOccurrences.mockClear();
  });

  it('plans a series, not one event', async () => {
    const plan = await planEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=4'), rsoId: 1 });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0]).toMatchObject({
      action: 'create',
      kind: 'series',
      external_uid: 'weekly@ieee',
      occurrences: 4,
      recurrence: { interval_weeks: 1, days_of_week: 'Tue' },
    });
  });

  it('runs to the end of the term when the rule never ends', async () => {
    const plan = await planEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU'), rsoId: 1 });
    expect(plan.entries[0].recurrence.ends_on <= TERM_END).toBe(true);
    expect(plan.entries[0].occurrences).toBeGreaterThan(10);
  });

  it('stops where the rule says to stop', async () => {
    const plan = await planEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260922T235959Z'), rsoId: 1 });
    expect(plan.entries[0].occurrences).toBe(4);
    expect(plan.entries[0].recurrence.ends_on).toBe('2026-09-22');
  });

  it('leaves out the dates the file excludes', async () => {
    const plan = await planEventImport({
      ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=4', ['EXDATE:20260908T180000']),
      rsoId: 1,
    });
    expect(plan.entries[0].occurrences).toBe(3);
    expect(plan.entries[0].occurrence_rows.map(o => o.date)).not.toContain('2026-09-08');
  });

  it('gives every occurrence an identifier of its own, built from the entry and its date', async () => {
    const plan = await planEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=2'), rsoId: 1 });
    expect(plan.entries[0].occurrence_rows.map(o => o.external_uid)).toEqual([
      'weekly@ieee::20260901', 'weekly@ieee::20260908',
    ]);
  });

  /**
   * Monthly and yearly rules are out of scope, and saying so is the point: the
   * preview reports them rather than quietly importing one week of a series.
   */
  it('reports a rule it does not expand, and imports the first occurrence', async () => {
    const plan = await planEventImport({ ics: repeating('FREQ=MONTHLY;BYMONTHDAY=1'), rsoId: 1 });
    expect(plan.entries[0]).toMatchObject({ kind: 'event', repeats: 'not expanded' });
    expect(plan.notExpanded).toBe(1);
  });

  it('creates the series and its occurrences when it is applied', async () => {
    const result = await applyEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=3'), rsoId: 1, createdBy: 'tester' });
    expect(createSeriesWithOccurrences).toHaveBeenCalledTimes(1);
    const [{ series, occurrences, event }] = createSeriesWithOccurrences.mock.calls[0];
    expect(series).toMatchObject({ rso_id: 1, created_by: 'tester', external_uid: 'weekly@ieee', days_of_week: 'Tue' });
    expect(occurrences).toHaveLength(3);
    expect(event.title).toBe('Weekly meeting');
    expect(result.created).toBe(3);
    expect(result.series_created).toBe(1);
  });

  /**
   * The second import of a file is the one that matters. It has to land on the
   * weeks the first one created rather than making a second copy of the term.
   */
  it('updates the weeks it already created rather than duplicating them', async () => {
    findSeriesByUid.mockResolvedValue([{ seriesId: 5, externalUid: 'weekly@ieee' }]);
    occurrencesOfSeries.mockResolvedValue([
      { event_id: 21, external_uid: 'weekly@ieee::20260901' },
      { event_id: 22, external_uid: 'weekly@ieee::20260908' },
    ]);

    const plan = await planEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=3'), rsoId: 1 });
    expect(plan.entries[0]).toMatchObject({ action: 'update', series_id: 5, updating: 2, creating: 1, removing: 0 });

    await applyEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=3'), rsoId: 1, createdBy: 'tester' });
    expect(createSeriesWithOccurrences).not.toHaveBeenCalled();
    expect(updateEvent).toHaveBeenCalledTimes(2);
    expect(createEvent).toHaveBeenCalledTimes(1);
    expect(createEvent.mock.calls[0][0]).toMatchObject({
      series_id: 5, external_uid: 'weekly@ieee::20260915',
    });
  });

  it('removes a week the rule no longer holds', async () => {
    findSeriesByUid.mockResolvedValue([{ seriesId: 5, externalUid: 'weekly@ieee' }]);
    occurrencesOfSeries.mockResolvedValue([
      { event_id: 21, external_uid: 'weekly@ieee::20260901' },
      { event_id: 99, external_uid: 'weekly@ieee::20261201' },
    ]);
    const plan = await planEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=1'), rsoId: 1 });
    expect(plan.entries[0]).toMatchObject({ removing: 1 });

    await applyEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=1'), rsoId: 1, createdBy: 'tester' });
    expect(deleteEvent).toHaveBeenCalledWith(99);
  });

  /**
   * Before rules were expanded, this entry was imported as a single event
   * carrying the entry's own identifier. Leaving that row where it is would
   * show the first week twice.
   */
  it('replaces the single event an earlier import made for the same entry', async () => {
    findEventsByUid.mockResolvedValue([{ event_id: 30, external_uid: 'weekly@ieee' }]);
    const plan = await planEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=2'), rsoId: 1 });
    expect(plan.entries[0].replaces).toEqual([30]);

    await applyEventImport({ ics: repeating('FREQ=WEEKLY;BYDAY=TU;COUNT=2'), rsoId: 1, createdBy: 'tester' });
    expect(deleteEvent).toHaveBeenCalledWith(30);
    expect(createSeriesWithOccurrences).toHaveBeenCalledTimes(1);
  });

  /**
   * One week of a series moved or renamed is exported as its own entry
   * carrying the parent identifier. It used to be dropped as a duplicate.
   */
  it('lands an overriding entry on the week it stands in for', async () => {
    const ics = calendar([
      'BEGIN:VEVENT', 'UID:weekly@ieee', 'SUMMARY:Weekly meeting',
      'DTSTART:20260901T180000', 'DTEND:20260901T193000',
      'RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:weekly@ieee', 'RECURRENCE-ID:20260908T180000',
      'SUMMARY:Weekly meeting, guest speaker',
      'DTSTART:20260908T190000', 'DTEND:20260908T203000', 'END:VEVENT',
    ]);
    const plan = await planEventImport({ ics, rsoId: 1 });
    const override = plan.entries.find(e => e.external_uid === 'weekly@ieee::20260908');
    expect(override).toMatchObject({ kind: 'event', title: 'Weekly meeting, guest speaker' });
    expect(plan.duplicates).toBe(0);
  });

  it('refuses a file whose rules would expand past what one request should write', async () => {
    const many = Array.from({ length: 40 }, (_, i) => [
      'BEGIN:VEVENT', `UID:many-${i}@ieee`, 'SUMMARY:Daily standup',
      'DTSTART:20260901T090000', 'DTEND:20260901T091500',
      'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=60', 'END:VEVENT',
    ]).flat();
    await expect(planEventImport({ ics: calendar(many), rsoId: 1 }))
      .rejects.toThrow(/calendar/i);
  });
});
