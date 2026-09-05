import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end, events, midterms, rsos, calendarImport, outbox;

/**
 * The writers: every change the Discord bot has to hear about, performed
 * through the controller that a request reaches, with the entry it left read
 * back out of the table.
 *
 * These run against a real database because that is the only place the rule
 * this rests on can be checked: an entry never describes a change that did not
 * happen. Where the change runs inside a transaction the entry is written on
 * that transaction's connection, so a rollback takes the entry with it, and
 * where it does not the entry follows the change and carries the state the
 * change left behind.
 */

/** Run a controller as a request would, and hand back what it answered. */
async function call(handler, { params = {}, body = {}, query: search = {}, user = null } = {}) {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let failure = null;
  await handler({ params, body, query: search, user }, res, err => { failure = err; });
  if (failure) throw failure;
  return res;
}

/** Every entry in the outbox, oldest first, with the payload as an object. */
async function entries() {
  const rows = await query('SELECT * FROM Outbox ORDER BY outbox_id');
  return rows.map(row => ({
    ...row,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  }));
}

const ALICE = { net_id: 'alice', is_global_admin: false };

async function seed() {
  for (const table of [
    'Outbox', 'Event_Tags', 'Tags', 'Events', 'Event_Series', 'Midterms', 'Courses',
    'Facility_Reservations', 'Locations', 'RSO_Memberships', 'RSOs', 'Users',
  ]) {
    await query(`DELETE FROM ${table}`);
  }
  await query(`INSERT INTO Users (net_id, full_name, email, is_global_admin) VALUES
    ('alice', 'Alice Adams', 'alice@illinois.edu', 0),
    ('bob',   'Bob Brown',   'bob@illinois.edu',   0)`);
  await query(`INSERT INTO RSOs (rso_id, name, description, logo_color) VALUES
    (1, 'IEEE', 'The student branch.', '#13294B')`);
  await query("INSERT INTO RSO_Memberships (net_id, rso_id, role) VALUES ('alice', 1, 'Board')");
  await query(`INSERT INTO Locations (location_id, building, room_number, max_capacity, has_av_equipment) VALUES
    (5, 'Electrical & Computer Eng Bldg', '1002', 40, 1)`);
}

describe('the outbox writers', () => {
  beforeAll(async () => {
    ({ query, end } = await migratedDb());
    events = await import('../../controllers/events.js');
    midterms = await import('../../controllers/midterms.js');
    rsos = await import('../../controllers/rsos.js');
    calendarImport = await import('../../controllers/calendarImport.js');
    outbox = await import('../../db/queries/outbox.ts');
  }, 180_000);
  afterAll(async () => { await end(); });
  beforeEach(seed);

  describe('creating an event', () => {
    const body = {
      rso_id: 1, title: 'General meeting', description: 'Bring a laptop.',
      start_time: '2027-09-10 18:00:00', end_time: '2027-09-10 19:00:00',
      location_id: 5, location_note: 'Use the north entrance.',
    };

    it('writes event.created carrying the event the reading endpoints answer with', async () => {
      const res = await call(events.createEvent, { body, user: ALICE });
      expect(res.statusCode).toBe(201);

      const [entry] = await entries();
      expect(entry.kind).toBe('event.created');
      expect(entry.subject_type).toBe('event');
      expect(entry.subject_id).toBe(String(res.body.event_id));
      expect(entry.rso_id).toBe(1);
      expect(entry.payload.event).toEqual({
        event_id: res.body.event_id, rso_id: 1, rso_name: 'IEEE', title: 'General meeting',
        description: 'Bring a laptop.', start_time: '2027-09-10 18:00:00', end_time: '2027-09-10 19:00:00',
        is_private: false, cancelled_at: null, location_id: 5,
        building: 'Electrical & Computer Eng Bldg', room_number: '1002',
        location_text: null, location_note: 'Use the north entrance.',
        series_id: null, series_frequency: null, series_interval_weeks: null,
        series_days_of_week: null, series_ends_on: null, interest_count: 0,
      });
    });

    it('leaves no entry when the room was already booked and nothing was written', async () => {
      await call(events.createEvent, { body, user: ALICE });
      await query('DELETE FROM Outbox');

      const res = await call(events.createEvent, { body, user: ALICE });
      expect(res.statusCode).toBe(409);
      expect(await entries()).toEqual([]);
    });

    it('leaves no entry when the person may not create the event', async () => {
      const res = await call(events.createEvent, { body, user: { net_id: 'bob', is_global_admin: false } });
      expect(res.statusCode).toBe(403);
      expect(await entries()).toEqual([]);
    });
  });

  describe('changing one event', () => {
    beforeEach(async () => {
      await query(
        `INSERT INTO Events (event_id, rso_id, created_by, location_id, title, description, start_time, end_time)
         VALUES (10, 1, 'alice', 5, 'General meeting', 'Bring a laptop.', '2027-09-10 18:00:00', '2027-09-10 19:00:00')`
      );
      await query('DELETE FROM Outbox');
    });

    const edit = {
      title: 'General meeting, moved', description: 'Bring a laptop.',
      start_time: '2027-09-10 19:00:00', end_time: '2027-09-10 20:00:00',
      location_id: 5, is_private: false,
    };

    it('writes event.updated naming the fields that changed', async () => {
      const res = await call(events.updateEvent, { params: { id: '10' }, body: edit, user: ALICE });
      expect(res.statusCode).toBe(200);

      const [entry] = await entries();
      expect(entry.kind).toBe('event.updated');
      expect(entry.subject_type).toBe('event');
      expect(entry.subject_id).toBe('10');
      expect(entry.rso_id).toBe(1);
      expect(entry.payload.changed.sort()).toEqual(['end_time', 'start_time', 'title']);
      expect(entry.payload.event.title).toBe('General meeting, moved');
      expect(entry.payload.event.start_time).toBe('2027-09-10 19:00:00');
    });

    it('carries the event as the database holds it once the change has been made', async () => {
      await call(events.updateEvent, { params: { id: '10' }, body: edit, user: ALICE });
      const [row] = await query('SELECT title, start_time FROM Events WHERE event_id = 10');
      const [entry] = await entries();
      expect(entry.payload.event.title).toBe(row.title);
      expect(entry.payload.event.start_time).toBe(row.start_time);
    });

    it('leaves no entry when the event the request named is not there', async () => {
      const res = await call(events.updateEvent, { params: { id: '999' }, body: edit, user: ALICE });
      expect(res.statusCode).toBe(404);
      expect(await entries()).toEqual([]);
    });

    it('writes event.cancelled when an event is cancelled', async () => {
      const res = await call(events.cancelEvent, { params: { id: '10' }, user: ALICE });
      expect(res.statusCode).toBe(200);

      const [entry] = await entries();
      expect(entry.kind).toBe('event.cancelled');
      expect(entry.subject_id).toBe('10');
      expect(entry.payload.event.cancelled_at).toBe(res.body.cancelled_at);
    });

    it('writes event.updated with cancelled_at changed when a cancellation is undone', async () => {
      await call(events.cancelEvent, { params: { id: '10' }, user: ALICE });
      await query('DELETE FROM Outbox');

      await call(events.restoreEvent, { params: { id: '10' }, user: ALICE });
      const [entry] = await entries();
      expect(entry.kind).toBe('event.updated');
      expect(entry.payload.changed).toEqual(['cancelled_at']);
      expect(entry.payload.event.cancelled_at).toBeNull();
    });

    it('writes nothing when an event that is already cancelled is cancelled again', async () => {
      await call(events.cancelEvent, { params: { id: '10' }, user: ALICE });
      await query('DELETE FROM Outbox');

      await call(events.cancelEvent, { params: { id: '10' }, user: ALICE });
      expect(await entries()).toEqual([]);
    });

    it('writes event.deleted carrying the event as it last stood', async () => {
      const res = await call(events.deleteEvent, { params: { id: '10' }, user: ALICE });
      expect(res.statusCode).toBe(200);

      const [entry] = await entries();
      expect(entry.kind).toBe('event.deleted');
      expect(entry.subject_id).toBe('10');
      expect(entry.rso_id).toBe(1);
      expect(entry.payload.event.title).toBe('General meeting');
      expect(await query('SELECT event_id FROM Events WHERE event_id = 10')).toEqual([]);
    });
  });

  describe('a repeating event', () => {
    const SERIES_BODY = {
      rso_id: 1, title: 'Weekly meeting', description: 'Every week in term.',
      start_time: '2027-09-07 18:00:00', end_time: '2027-09-07 19:30:00',
      recurrence: { days_of_week: ['Tue'], ends_on: '2027-09-21' },
    };

    /** Create the series a request would, and hand back what it answered. */
    async function createSeries(body = SERIES_BODY) {
      const res = await call(events.createEventSeries, { body, user: ALICE });
      expect(res.statusCode).toBe(201);
      return res.body;
    }

    it('writes one series.created for the whole repeat, with its occurrences', async () => {
      const created = await createSeries();
      expect(created.event_ids).toHaveLength(3);

      const written = await entries();
      expect(written).toHaveLength(1);
      const [entry] = written;
      expect(entry.kind).toBe('series.created');
      expect(entry.subject_type).toBe('series');
      expect(entry.subject_id).toBe(String(created.series_id));
      expect(entry.rso_id).toBe(1);
      expect(entry.payload.series).toEqual({
        series_id: created.series_id, rso_id: 1, frequency: 'weekly', interval_weeks: 1,
        days_of_week: 'Tue', starts_on: '2027-09-07', ends_on: '2027-09-21',
        start_of_day: '18:00:00', duration_minutes: 90,
      });
      expect(entry.payload.event_ids).toEqual(created.event_ids);
    });

    it('writes series.updated for an edit that reaches the whole repeat', async () => {
      const created = await createSeries();
      await query('DELETE FROM Outbox');

      const res = await call(events.updateEvent, {
        params: { id: String(created.event_ids[0]) },
        query: { scope: 'all' },
        body: { title: 'Weekly meeting, renamed', description: 'Every week in term.', is_private: false },
        user: ALICE,
      });
      expect(res.statusCode).toBe(200);

      const written = await entries();
      expect(written).toHaveLength(1);
      const [entry] = written;
      expect(entry.kind).toBe('series.updated');
      expect(entry.subject_id).toBe(String(created.series_id));
      expect(entry.payload.changed).toEqual(['title']);
      expect(entry.payload.affected_event_ids).toEqual(created.event_ids);
      expect(entry.payload.event_ids).toEqual(created.event_ids);
    });

    it('names only the weeks a following edit reached', async () => {
      const created = await createSeries();
      await query('DELETE FROM Outbox');

      await call(events.updateEvent, {
        params: { id: String(created.event_ids[1]) },
        query: { scope: 'following' },
        body: { title: 'Weekly meeting, renamed', description: 'Every week in term.', is_private: false },
        user: ALICE,
      });

      const [entry] = await entries();
      expect(entry.kind).toBe('series.updated');
      expect(entry.payload.affected_event_ids).toEqual(created.event_ids.slice(1));
      expect(entry.payload.event_ids).toEqual(created.event_ids);
    });

    it('writes series.deleted when the whole repeat goes', async () => {
      const created = await createSeries();
      await query('DELETE FROM Outbox');

      const res = await call(events.deleteEvent, {
        params: { id: String(created.event_ids[0]) },
        query: { scope: 'all' },
        user: ALICE,
      });
      expect(res.statusCode).toBe(200);

      const written = await entries();
      expect(written).toHaveLength(1);
      const [entry] = written;
      expect(entry.kind).toBe('series.deleted');
      expect(entry.subject_id).toBe(String(created.series_id));
      expect(entry.rso_id).toBe(1);
      expect(entry.payload.series.series_id).toBe(created.series_id);
      expect(entry.payload.event_ids).toEqual([]);
      expect(entry.payload.affected_event_ids).toEqual(created.event_ids);
    });

    it('writes series.updated when only the weeks from one date on go', async () => {
      const created = await createSeries();
      await query('DELETE FROM Outbox');

      await call(events.deleteEvent, {
        params: { id: String(created.event_ids[1]) },
        query: { scope: 'following' },
        user: ALICE,
      });

      const [entry] = await entries();
      expect(entry.kind).toBe('series.updated');
      expect(entry.payload.affected_event_ids).toEqual(created.event_ids.slice(1));
      expect(entry.payload.event_ids).toEqual([created.event_ids[0]]);
      expect(entry.payload.changed).toEqual([]);
    });

    it('writes event.deleted, and not a series entry, when one week goes on its own', async () => {
      const created = await createSeries();
      await query('DELETE FROM Outbox');

      await call(events.deleteEvent, { params: { id: String(created.event_ids[1]) }, user: ALICE });

      const written = await entries();
      expect(written.map(entry => entry.kind)).toEqual(['event.deleted']);
      expect(written[0].subject_id).toBe(String(created.event_ids[1]));
    });
  });

  describe('the exam schedule', () => {
    const ADMIN = { net_id: 'alice', is_global_admin: true };

    beforeEach(async () => {
      await query("INSERT INTO Courses (course_code, title) VALUES ('ECE 385', 'Digital Systems Laboratory')");
      await query(
        `INSERT INTO Midterms (midterm_id, course_code, submitted_by, location_id, title, start_time, end_time, status)
         VALUES (20, 'ECE 385', 'alice', 5, 'Midterm 1', '2027-10-01 19:00:00', '2027-10-01 21:00:00', 'Pending')`
      );
      await query('DELETE FROM Outbox');
    });

    it('writes midterm.updated when a student submits one, which is not confirmed yet', async () => {
      const res = await call(midterms.createMidterm, {
        body: {
          course_code: 'ECE 385', location_id: 5, title: 'Midterm 2',
          start_time: '2027-11-05 19:00:00', end_time: '2027-11-05 21:00:00',
        },
        user: ALICE,
      });
      expect(res.statusCode).toBe(201);

      const [entry] = await entries();
      expect(entry.kind).toBe('midterm.updated');
      expect(entry.subject_type).toBe('midterm');
      expect(entry.subject_id).toBe(String(res.body.midterm_id));
      expect(entry.rso_id).toBeNull();
      expect(entry.payload.midterm).toEqual({
        midterm_id: res.body.midterm_id, course_code: 'ECE 385',
        course_title: 'Digital Systems Laboratory', title: 'Midterm 2',
        start_time: '2027-11-05 19:00:00', end_time: '2027-11-05 21:00:00',
        status: 'Pending', location_text: null,
        building: 'Electrical & Computer Eng Bldg', room_number: '1002',
      });
    });

    it('writes midterm.confirmed when an administrator confirms one', async () => {
      const res = await call(midterms.updateMidtermStatus, {
        params: { id: '20' }, body: { status: 'Confirmed' }, user: ADMIN,
      });
      expect(res.statusCode).toBe(200);

      const [entry] = await entries();
      expect(entry.kind).toBe('midterm.confirmed');
      expect(entry.subject_id).toBe('20');
      expect(entry.payload.midterm.status).toBe('Confirmed');
    });

    it('writes midterm.cancelled when an administrator cancels one', async () => {
      await call(midterms.updateMidtermStatus, {
        params: { id: '20' }, body: { status: 'Cancelled' }, user: ADMIN,
      });
      const [entry] = await entries();
      expect(entry.kind).toBe('midterm.cancelled');
      expect(entry.payload.midterm.status).toBe('Cancelled');
    });

    it('writes midterm.cancelled, saying it was removed, when one is deleted outright', async () => {
      const res = await call(midterms.deleteMidterm, { params: { id: '20' }, user: ALICE });
      expect(res.statusCode).toBe(200);

      const [entry] = await entries();
      expect(entry.kind).toBe('midterm.cancelled');
      expect(entry.subject_id).toBe('20');
      expect(entry.payload.deleted).toBe(true);
      expect(entry.payload.midterm.title).toBe('Midterm 1');
    });

    it('leaves no entry when the person may not change the schedule', async () => {
      const res = await call(midterms.updateMidtermStatus, {
        params: { id: '20' }, body: { status: 'Confirmed' },
        user: { net_id: 'bob', is_global_admin: false },
      });
      expect(res.statusCode).toBe(403);
      expect(await entries()).toEqual([]);
    });
  });

  describe('importing a calendar', () => {
    const calendar = lines => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
    const entry = ({ uid, summary, start, end, rrule = null }) => [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `SUMMARY:${summary}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      ...(rrule ? [`RRULE:${rrule}`] : []),
      'END:VEVENT',
    ];

    const importEvents = ics => call(calendarImport.importEvents, {
      body: { rso_id: 1, ics }, user: ALICE,
    });

    it('writes event.created for an entry it brought in', async () => {
      const res = await importEvents(calendar(entry({
        uid: 'one', summary: 'Guest lecture', start: '20271001T180000', end: '20271001T190000',
      })));
      expect(res.body.created).toBe(1);

      const written = await entries();
      expect(written.map(item => item.kind)).toEqual(['event.created']);
      expect(written[0].payload.event.title).toBe('Guest lecture');
      expect(written[0].rso_id).toBe(1);
    });

    it('writes event.updated when the same entry comes back changed', async () => {
      const first = calendar(entry({
        uid: 'one', summary: 'Guest lecture', start: '20271001T180000', end: '20271001T190000',
      }));
      await importEvents(first);
      await query('DELETE FROM Outbox');

      await importEvents(calendar(entry({
        uid: 'one', summary: 'Guest lecture, moved', start: '20271001T190000', end: '20271001T200000',
      })));

      const written = await entries();
      expect(written.map(item => item.kind)).toEqual(['event.updated']);
      expect(written[0].payload.changed.sort()).toEqual(['end_time', 'start_time', 'title']);
    });

    it('writes one series.created for a repeating entry, and series.updated when it grows', async () => {
      await importEvents(calendar(entry({
        uid: 'weekly', summary: 'Lab hours', start: '20271005T180000', end: '20271005T190000',
        rrule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20271012T235900Z',
      })));
      const created = await entries();
      expect(created.map(item => item.kind)).toEqual(['series.created']);
      expect(created[0].payload.event_ids).toHaveLength(2);
      await query('DELETE FROM Outbox');

      await importEvents(calendar(entry({
        uid: 'weekly', summary: 'Lab hours', start: '20271005T180000', end: '20271005T190000',
        rrule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20271019T235900Z',
      })));

      const changed = await entries();
      expect(changed.map(item => item.kind)).toEqual(['series.updated']);
      expect(changed[0].payload.event_ids).toHaveLength(3);
      expect(changed[0].payload.affected_event_ids).toHaveLength(3);
    });

    it('writes midterm.confirmed for an exam an import brought in, and midterm.updated for one it changed', async () => {
      await query("INSERT INTO Courses (course_code, title) VALUES ('ECE 385', 'Digital Systems Laboratory')");
      const exam = summary => calendar(entry({
        uid: 'exam-one', summary, start: '20271101T190000', end: '20271101T210000',
      }));

      await call(calendarImport.importMidterms, { body: { ics: exam('ECE 385 Midterm 1') }, user: ALICE });
      let written = await entries();
      expect(written.map(item => item.kind)).toEqual(['midterm.confirmed']);
      expect(written[0].payload.midterm.status).toBe('Confirmed');
      await query('DELETE FROM Outbox');

      await call(calendarImport.importMidterms, { body: { ics: exam('ECE 385 Midterm 1, room changed') }, user: ALICE });
      written = await entries();
      expect(written.map(item => item.kind)).toEqual(['midterm.updated']);
      expect(written[0].payload.midterm.title).toBe('ECE 385 Midterm 1, room changed');
    });
  });

  describe('membership of an RSO', () => {
    beforeEach(async () => { await query('DELETE FROM Outbox'); });

    it('writes membership.changed when somebody is added', async () => {
      const res = await call(rsos.addMember, {
        params: { id: '1' }, body: { netId: 'bob', role: 'Board' }, user: ALICE,
      });
      expect(res.statusCode).toBe(201);

      const [entry] = await entries();
      expect(entry.kind).toBe('membership.changed');
      expect(entry.subject_type).toBe('membership');
      expect(entry.subject_id).toBe('bob:1');
      expect(entry.rso_id).toBe(1);
      expect(entry.payload).toEqual({ net_id: 'bob', rso_id: 1, role: 'Board' });
    });

    it('writes membership.changed when an existing member is given another role', async () => {
      await call(rsos.addMember, { params: { id: '1' }, body: { netId: 'bob', role: 'Member' }, user: ALICE });
      await query('DELETE FROM Outbox');

      await call(rsos.addMember, { params: { id: '1' }, body: { netId: 'bob', role: 'Board' }, user: ALICE });
      const [entry] = await entries();
      expect(entry.payload).toEqual({ net_id: 'bob', rso_id: 1, role: 'Board' });
    });

    it('writes nothing when the same person is added again in the same role', async () => {
      await call(rsos.addMember, { params: { id: '1' }, body: { netId: 'bob', role: 'Member' }, user: ALICE });
      await query('DELETE FROM Outbox');

      await call(rsos.addMember, { params: { id: '1' }, body: { netId: 'bob', role: 'Member' }, user: ALICE });
      expect(await entries()).toEqual([]);
    });

    it('writes membership.changed with no role when somebody is removed', async () => {
      const res = await call(rsos.removeMember, { params: { id: '1', netId: 'alice' }, user: ALICE });
      expect(res.statusCode).toBe(200);

      const [entry] = await entries();
      expect(entry.kind).toBe('membership.changed');
      expect(entry.subject_id).toBe('alice:1');
      expect(entry.payload).toEqual({ net_id: 'alice', rso_id: 1, role: null });
    });

    it('writes nothing when the person removed was not a member', async () => {
      const res = await call(rsos.removeMember, { params: { id: '1', netId: 'bob' }, user: ALICE });
      expect(res.statusCode).toBe(404);
      expect(await entries()).toEqual([]);
    });
  });
});
