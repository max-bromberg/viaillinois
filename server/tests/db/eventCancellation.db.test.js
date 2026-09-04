import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb, seedEventFixture } from '../support/botTables.js';

let query, end;

/**
 * A cancelled event is still an event: it keeps its row, so the people who
 * planned to go can be told, and it gains the time it was cancelled. A
 * location note is the small thing a board changes at the door.
 */
describe('Events: cancellation and the location note', () => {
  beforeAll(async () => { ({ query, end } = await migratedDb()); }, 180_000);
  afterAll(async () => { await end(); });

  beforeEach(async () => {
    await query('DELETE FROM Events');
    await query('DELETE FROM RSOs');
    await query('DELETE FROM Users');
    await seedEventFixture(query);
  });

  it('an event is not cancelled and has no note until somebody says so', async () => {
    const [row] = await query('SELECT cancelled_at, location_note FROM Events WHERE event_id = 10');
    expect(row.cancelled_at).toBeNull();
    expect(row.location_note).toBeNull();
  });

  it('records when an event was cancelled', async () => {
    await query("UPDATE Events SET cancelled_at = '2026-09-09 08:30:00' WHERE event_id = 10");
    const [row] = await query('SELECT cancelled_at FROM Events WHERE event_id = 10');
    expect(row.cancelled_at).toBe('2026-09-09 08:30:00');
  });

  it('holds a location note beside the room', async () => {
    await query("UPDATE Events SET location_note = 'Use the north entrance, the south door is locked after six.' WHERE event_id = 10");
    const [row] = await query('SELECT location_note FROM Events WHERE event_id = 10');
    expect(row.location_note).toBe('Use the north entrance, the south door is locked after six.');
  });

  it('can be uncancelled by clearing the time', async () => {
    await query("UPDATE Events SET cancelled_at = '2026-09-09 08:30:00' WHERE event_id = 10");
    await query('UPDATE Events SET cancelled_at = NULL WHERE event_id = 10');
    const [row] = await query('SELECT cancelled_at FROM Events WHERE event_id = 10');
    expect(row.cancelled_at).toBeNull();
  });
});
