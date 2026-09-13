import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';
import { campusStartOfToday } from '../../lib/timezone.js';

let query, end, interest, feedback, calendars;

// One database for the whole file. The pool is a module singleton, so a suite
// that ended it would leave the next suite in this file with nothing.
beforeAll(async () => {
  ({ query, end } = await migratedDb());
  interest  = await import('../../db/queries/eventInterest.ts');
  feedback  = await import('../../db/queries/eventFeedback.ts');
  calendars = await import('../../db/queries/personalCalendars.ts');
}, 180_000);
afterAll(async () => { await end(); });

const TODAY = campusStartOfToday().slice(0, 10);
function campusDay(offset) {
  const [year, month, day] = TODAY.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}
const NEXT_WEEK = campusDay(7);
const LAST_WEEK = campusDay(-7);
const LAST_TERM = campusDay(-60);

/** A hashed subject is what somebody who has not linked is counted under. */
const HASHED = `h:${'K'.repeat(43)}`;

async function seed() {
  for (const table of ['Event_Interest', 'Event_Feedback', 'Personal_Calendars', 'Events', 'RSOs', 'Users']) {
    await query(`DELETE FROM ${table}`);
  }
  await query(
    `INSERT INTO Users (net_id, full_name, email) VALUES
      ('alice', 'Alice Adams', 'alice@illinois.edu'),
      ('bob', 'Bob Brown', 'bob@illinois.edu')`
  );
  await query("INSERT INTO RSOs (rso_id, name) VALUES (1, 'IEEE'), (2, 'HKN')");
  await query(
    `INSERT INTO Events (event_id, rso_id, created_by, title, start_time, end_time, cancelled_at) VALUES
      (10, 1, 'alice', 'Just happened',   '${LAST_WEEK} 18:00:00', '${LAST_WEEK} 19:00:00', NULL),
      (11, 1, 'alice', 'Still to come',   '${NEXT_WEEK} 18:00:00', '${NEXT_WEEK} 19:00:00', NULL),
      (12, 1, 'alice', 'Called off',      '${NEXT_WEEK} 20:00:00', '${NEXT_WEEK} 21:00:00', '${TODAY} 09:00:00'),
      (13, 1, 'alice', 'Long ago',        '${LAST_TERM} 18:00:00', '${LAST_TERM} 19:00:00', NULL),
      (14, 2, 'alice', 'Another RSO',     '${NEXT_WEEK} 18:00:00', '${NEXT_WEEK} 19:00:00', NULL)`
  );
}

/**
 * Interest is the count that replaced the RSVPs, and it is written from two
 * places: a person the platform knows by their NetID, and somebody who has
 * only ever pressed a button in Discord, who is counted under a salted hash so
 * that the table is not a record of who goes to which meeting.
 */
describe('interest', () => {
  beforeEach(seed);

  it('counts a person once however many times they say it', async () => {
    await interest.setInterest({ eventId: 11, subject: 'alice', source: 'discord_button' });
    await interest.setInterest({ eventId: 11, subject: 'alice', source: 'discord_event' });
    expect(await interest.countInterest(11)).toBe(1);
    const rows = await query('SELECT source FROM Event_Interest WHERE event_id = 11');
    expect(rows[0].source).toBe('discord_event');
  });

  it('holds a hashed subject beside a NetID, and counts both', async () => {
    await interest.setInterest({ eventId: 11, subject: 'alice', source: 'web' });
    await interest.setInterest({ eventId: 11, subject: HASHED, source: 'discord_button' });
    expect(await interest.countInterest(11)).toBe(2);
  });

  it('takes it back, and takes back what was never there without complaining', async () => {
    await interest.setInterest({ eventId: 11, subject: 'alice', source: 'web' });
    expect(await interest.clearInterest({ eventId: 11, subject: 'alice' })).toBe(1);
    expect(await interest.countInterest(11)).toBe(0);
    expect(await interest.clearInterest({ eventId: 11, subject: 'alice' })).toBe(0);
  });

  it('counts each event on its own', async () => {
    await interest.setInterest({ eventId: 10, subject: 'alice', source: 'web' });
    expect(await interest.countInterest(11)).toBe(0);
    expect(await interest.countInterest(10)).toBe(1);
  });
});

/**
 * Feedback is one rating per person per event. What the board reads is the
 * average, how many people gave one and what they wrote, and never who wrote
 * which, because an RSO small enough for four ratings to identify their
 * authors is most of them.
 */
describe('feedback', () => {
  beforeEach(seed);

  it('replaces what somebody said before rather than counting them twice', async () => {
    await feedback.saveFeedback({ eventId: 10, netId: 'alice', rating: 2, comment: 'Too cold.' });
    await feedback.saveFeedback({ eventId: 10, netId: 'alice', rating: 5, comment: 'They fixed the heating.' });
    const rows = await query('SELECT rating, comment FROM Event_Feedback WHERE event_id = 10');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 5, comment: 'They fixed the heating.' });
  });

  it('takes a rating with no comment', async () => {
    await feedback.saveFeedback({ eventId: 10, netId: 'alice', rating: 4 });
    const rows = await query('SELECT comment FROM Event_Feedback WHERE event_id = 10');
    expect(rows[0].comment).toBeNull();
  });

  it('gives the board the average, the count and the comments', async () => {
    await feedback.saveFeedback({ eventId: 10, netId: 'alice', rating: 5, comment: 'The pizza arrived on time.' });
    await feedback.saveFeedback({ eventId: 10, netId: 'bob', rating: 4 });
    const rows = await feedback.getFeedbackByRso(1);
    const held = rows.find(row => row.eventId === 10);
    expect(held).toMatchObject({
      title: 'Just happened', average: 4.5, ratings: 2, comments: ['The pizza arrived on time.'],
    });
  });

  it('names nobody who rated', async () => {
    await feedback.saveFeedback({ eventId: 10, netId: 'alice', rating: 5, comment: 'Good.' });
    const rows = await feedback.getFeedbackByRso(1);
    expect(JSON.stringify(rows)).not.toContain('alice');
  });

  it('lists an event nobody rated, so the silence is visible too', async () => {
    const rows = await feedback.getFeedbackByRso(1);
    const upcoming = rows.find(row => row.eventId === 11);
    expect(upcoming).toMatchObject({ average: null, ratings: 0, comments: [] });
  });

  it('leaves out what was cancelled, what is long past, and another RSO', async () => {
    await feedback.saveFeedback({ eventId: 12, netId: 'alice', rating: 1 });
    await feedback.saveFeedback({ eventId: 13, netId: 'alice', rating: 1 });
    await feedback.saveFeedback({ eventId: 14, netId: 'alice', rating: 1 });
    const held = (await feedback.getFeedbackByRso(1)).map(row => row.eventId);
    expect(held).toEqual([10, 11]);
  });

  it('refuses a rating the column does not allow', async () => {
    await expect(feedback.saveFeedback({ eventId: 10, netId: 'alice', rating: 9 })).rejects.toThrow();
  });
});

/**
 * The calendar address is the whole of its own credential, so the row holds
 * only a hash of it, and asking for a new address is what takes the old one
 * away from whoever has a copy.
 */
describe('the personal calendar', () => {
  beforeEach(seed);

  it('makes one, and finds it again by the hash of its token', async () => {
    const { rotatedAt } = await calendars.rotateCalendar({
      netId: 'alice', tokenHash: 'a'.repeat(64), rsoIds: [1, 2],
    });
    expect(rotatedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(await calendars.getCalendarByTokenHash('a'.repeat(64)))
      .toEqual({ netId: 'alice', rsoIds: [1, 2] });
  });

  it('follows every RSO when the set is null', async () => {
    await calendars.rotateCalendar({ netId: 'alice', tokenHash: 'b'.repeat(64), rsoIds: null });
    expect(await calendars.getCalendarByTokenHash('b'.repeat(64)))
      .toEqual({ netId: 'alice', rsoIds: null });
  });

  it('leaves the address before it answering nothing', async () => {
    await calendars.rotateCalendar({ netId: 'alice', tokenHash: 'c'.repeat(64), rsoIds: null });
    await calendars.rotateCalendar({ netId: 'alice', tokenHash: 'd'.repeat(64), rsoIds: null });
    expect(await calendars.getCalendarByTokenHash('c'.repeat(64))).toBeNull();
    expect(await calendars.getCalendarByTokenHash('d'.repeat(64))).not.toBeNull();
    const rows = await query('SELECT COUNT(*) AS total FROM Personal_Calendars');
    expect(rows[0].total).toBe(1);
  });

  it('changes which RSOs it follows without changing the address', async () => {
    await calendars.rotateCalendar({ netId: 'alice', tokenHash: 'e'.repeat(64), rsoIds: [1] });
    expect(await calendars.setCalendarRsos({ netId: 'alice', rsoIds: [2] })).toBe(1);
    expect(await calendars.getCalendarByTokenHash('e'.repeat(64)))
      .toEqual({ netId: 'alice', rsoIds: [2] });
  });

  it('changes nothing for somebody who has no calendar yet', async () => {
    expect(await calendars.setCalendarRsos({ netId: 'bob', rsoIds: [1] })).toBe(0);
  });

  it('is one address per person, whoever asks for it', async () => {
    await calendars.rotateCalendar({ netId: 'alice', tokenHash: 'f'.repeat(64), rsoIds: null });
    await calendars.rotateCalendar({ netId: 'bob', tokenHash: '0'.repeat(64), rsoIds: [1] });
    const rows = await query('SELECT net_id FROM Personal_Calendars ORDER BY net_id');
    expect(rows.map(row => row.net_id)).toEqual(['alice', 'bob']);
  });
});
