import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migratedDb } from '../support/botTables.js';

let query, end, outbox, pool;

/**
 * The queries behind the outbox: writing an entry, writing one inside somebody
 * else's transaction, reading from a cursor, and forgetting what is old.
 *
 * What only a real database can answer is here: that an entry written on a
 * connection inside a transaction disappears when that transaction rolls back,
 * that the payload comes back as the object it went in as, and that the
 * identifiers a reader pages through only ever grow.
 */
describe('the outbox queries', () => {
  beforeAll(async () => {
    ({ query, end } = await migratedDb());
    outbox = await import('../../db/queries/outbox.ts');
    pool = (await import('../../db/pool.js')).default;
  }, 180_000);
  afterAll(async () => { await end(); });
  beforeEach(async () => { await query('DELETE FROM Outbox'); });

  it('writes an entry and gives back its identifier', async () => {
    const id = await outbox.writeOutbox({
      kind: 'event.created', subjectType: 'event', subjectId: '10', rsoId: 1,
      payload: { event: { event_id: 10, title: 'General meeting' } },
    });
    const rows = await query('SELECT * FROM Outbox');
    expect(rows).toHaveLength(1);
    expect(rows[0].outbox_id).toBe(id);
    expect(rows[0].kind).toBe('event.created');
    expect(rows[0].subject_type).toBe('event');
    expect(rows[0].subject_id).toBe('10');
    expect(rows[0].rso_id).toBe(1);
  });

  it('writes an entry that belongs to no RSO', async () => {
    await outbox.writeOutbox({
      kind: 'midterm.confirmed', subjectType: 'midterm', subjectId: '20', payload: { midterm: {} },
    });
    const rows = await query('SELECT rso_id FROM Outbox');
    expect(rows[0].rso_id).toBeNull();
  });

  it('writes through a given connection, so the entry joins that transaction', async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await outbox.writeOutboxOnConnection(conn, {
        kind: 'event.created', subjectType: 'event', subjectId: '11', rsoId: 1, payload: { event: {} },
      });
      await conn.rollback();
    } finally {
      conn.release();
    }
    expect(await query('SELECT outbox_id FROM Outbox')).toHaveLength(0);
  });

  it('keeps the entry a committed transaction wrote on its connection', async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await outbox.writeOutboxOnConnection(conn, {
        kind: 'event.created', subjectType: 'event', subjectId: '12', rsoId: 2,
        payload: { event: { event_id: 12 } },
      });
      await conn.commit();
    } finally {
      conn.release();
    }
    const rows = await query('SELECT subject_id, rso_id FROM Outbox');
    expect(rows).toEqual([{ subject_id: '12', rso_id: 2 }]);
  });

  it('reads entries after a cursor, in order, with the payload as an object', async () => {
    const first = await outbox.writeOutbox({
      kind: 'event.created', subjectType: 'event', subjectId: '10', rsoId: 1, payload: { event: { event_id: 10 } },
    });
    await outbox.writeOutbox({
      kind: 'event.updated', subjectType: 'event', subjectId: '10', rsoId: 1,
      payload: { event: { event_id: 10 }, changed: ['title'] },
    });
    await outbox.writeOutbox({
      kind: 'event.cancelled', subjectType: 'event', subjectId: '10', rsoId: 1, payload: { event: { event_id: 10 } },
    });

    const entries = await outbox.readOutbox({ after: first, limit: 50 });
    expect(entries.map(entry => entry.kind)).toEqual(['event.updated', 'event.cancelled']);
    expect(entries[0].payload).toEqual({ event: { event_id: 10 }, changed: ['title'] });
    expect(entries[0].outbox_id).toBeGreaterThan(first);
    expect(entries[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it('reads from the beginning when no cursor is given, and stops at the limit', async () => {
    for (const subjectId of ['10', '11', '12']) {
      await outbox.writeOutbox({ kind: 'event.created', subjectType: 'event', subjectId, rsoId: 1, payload: {} });
    }
    const entries = await outbox.readOutbox({ limit: 2 });
    expect(entries.map(entry => entry.subject_id)).toEqual(['10', '11']);
  });

  it('forgets entries older than the retention window and keeps the rest', async () => {
    await outbox.writeOutbox({ kind: 'event.created', subjectType: 'event', subjectId: '10', rsoId: 1, payload: {} });
    await query(
      `INSERT INTO Outbox (kind, subject_type, subject_id, rso_id, payload, created_at)
       VALUES ('event.created', 'event', '9', 1, '{}', DATE_SUB(NOW(), INTERVAL 31 DAY))`
    );

    const removed = await outbox.pruneOutbox(30);
    expect(removed).toBe(1);
    const rows = await query('SELECT subject_id FROM Outbox');
    expect(rows.map(row => row.subject_id)).toEqual(['10']);
  });
});
