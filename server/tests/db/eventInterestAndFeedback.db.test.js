import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb, seedEventFixture } from '../support/botTables.js';

let query, end;

// One database for the whole file. The pool is a module singleton, so a
// suite that ended it would leave the next suite in this file with nothing.
beforeAll(async () => { ({ query, end } = await migratedDb()); }, 180_000);
afterAll(async () => { await end(); });

async function resetFixture() {
  await query('DELETE FROM Event_Interest');
  await query('DELETE FROM Event_Feedback');
  await query('DELETE FROM Events');
  await query('DELETE FROM RSOs');
  await query('DELETE FROM Users');
  await seedEventFixture(query);
}

/**
 * Interest replaces the RSVPs the platform removed. A subject is a NetID for a
 * linked person and a salted hash for anyone else, and a person counts once.
 */
describe('Event_Interest', () => {
  beforeEach(resetFixture);

  const interest = (subject, source = 'discord_event') => query(
    'INSERT INTO Event_Interest (event_id, subject, source) VALUES (10, ?, ?)', [subject, source]
  );

  it('counts a linked person by NetID and an unlinked one by hash', async () => {
    await interest('alice');
    await interest('h:' + 'f'.repeat(43), 'discord_button');
    const rows = await query('SELECT subject, source FROM Event_Interest ORDER BY subject');
    expect(rows).toEqual([
      { subject: 'alice', source: 'discord_event' },
      { subject: 'h:' + 'f'.repeat(43), source: 'discord_button' },
    ]);
  });

  it('counts a person once per event', async () => {
    await interest('alice');
    await expect(interest('alice')).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('goes with the event when the event goes', async () => {
    await interest('alice');
    await query('DELETE FROM Events WHERE event_id = 10');
    expect(await query('SELECT * FROM Event_Interest')).toHaveLength(0);
  });

  it('refuses interest in an event that does not exist', async () => {
    await expect(query("INSERT INTO Event_Interest (event_id, subject, source) VALUES (99, 'alice', 'web')"))
      .rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
});

/**
 * One rating per person per event, between one and five, tied to a real
 * account so the board can trust the average without ever seeing who gave what.
 */
describe('Event_Feedback', () => {
  beforeEach(resetFixture);

  const feedback = (netId, rating, comment = null) => query(
    'INSERT INTO Event_Feedback (event_id, net_id, rating, comment) VALUES (10, ?, ?, ?)', [netId, rating, comment]
  );

  it('records a rating with an optional comment', async () => {
    await feedback('alice', 4, 'Good talk, the room was too small.');
    const rows = await query('SELECT rating, comment, created_at FROM Event_Feedback');
    expect(rows[0].rating).toBe(4);
    expect(rows[0].comment).toBe('Good talk, the room was too small.');
    expect(rows[0].created_at).toMatch(/^\d{4}-/);
  });

  it('takes one rating per person per event', async () => {
    await feedback('alice', 4);
    await expect(feedback('alice', 5)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('refuses a rating outside one to five', async () => {
    // Matched on the constraint's name rather than the driver's error code,
    // because MySQL and MariaDB report a failed check under different codes and
    // both name the constraint.
    await expect(feedback('alice', 0)).rejects.toThrow(/chk_feedback_rating/);
    await expect(feedback('alice', 6)).rejects.toThrow(/chk_feedback_rating/);
    expect(await query('SELECT * FROM Event_Feedback')).toHaveLength(0);
  });

  it('refuses a rating from a NetID VIA has never seen', async () => {
    await expect(feedback('nobody', 3)).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });

  it('goes with the event when the event goes', async () => {
    await feedback('alice', 4);
    await query('DELETE FROM Events WHERE event_id = 10');
    expect(await query('SELECT * FROM Event_Feedback')).toHaveLength(0);
  });
});
