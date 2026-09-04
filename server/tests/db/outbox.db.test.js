import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end;

/**
 * The outbox is read by identifier, in order, from a cursor. Everything the
 * bot's delivery guarantees rest on is that the identifiers only ever grow.
 */
describe('Outbox', () => {
  beforeAll(async () => { ({ query, end } = await migratedDb()); }, 180_000);
  afterAll(async () => { await end(); });
  beforeEach(async () => { await query('DELETE FROM Outbox'); });

  const write = (kind, subjectType, subjectId, rsoId, payload) => query(
    `INSERT INTO Outbox (kind, subject_type, subject_id, rso_id, payload)
     VALUES (?, ?, ?, ?, ?)`, [kind, subjectType, subjectId, rsoId, JSON.stringify(payload)]
  );

  it('numbers entries in the order they were written', async () => {
    await write('event.created', 'event', '10', 1, { title: 'First' });
    await write('event.updated', 'event', '10', 1, { title: 'Second' });
    const rows = await query('SELECT outbox_id, kind FROM Outbox ORDER BY outbox_id');
    expect(rows[1].outbox_id).toBeGreaterThan(rows[0].outbox_id);
    expect(rows.map(r => r.kind)).toEqual(['event.created', 'event.updated']);
  });

  it('gives back the payload it was given', async () => {
    await write('event.created', 'event', '10', 1, { title: 'General meeting', changed: ['title'] });
    const rows = await query('SELECT payload FROM Outbox');
    const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload;
    expect(payload).toEqual({ title: 'General meeting', changed: ['title'] });
  });

  it('allows an entry that belongs to no RSO', async () => {
    await write('link.completed', 'link', '123456789012345678', null, {});
    const rows = await query('SELECT rso_id FROM Outbox');
    expect(rows[0].rso_id).toBeNull();
  });

  it('stamps each entry with when it was written', async () => {
    await write('event.created', 'event', '10', 1, {});
    const rows = await query('SELECT created_at FROM Outbox');
    expect(rows[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it('can be read from a cursor', async () => {
    await write('event.created', 'event', '10', 1, {});
    await write('event.created', 'event', '11', 1, {});
    await write('event.created', 'event', '12', 1, {});
    const [first] = await query('SELECT outbox_id FROM Outbox ORDER BY outbox_id LIMIT 1');
    const after = await query('SELECT subject_id FROM Outbox WHERE outbox_id > ? ORDER BY outbox_id', [first.outbox_id]);
    expect(after.map(r => r.subject_id)).toEqual(['11', '12']);
  });
});
