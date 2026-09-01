import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../services/calendarImport.js', () => ({
  planEventImport: vi.fn().mockResolvedValue({ entries: [], skipped: 0 }),
  applyEventImport: vi.fn(), planMidtermImport: vi.fn(), applyMidtermImport: vi.fn(),
}));
vi.mock('../../db/queries/events.js', () => ({
  getPublicEvents: vi.fn().mockResolvedValue([]), countPublicEvents: vi.fn().mockResolvedValue([{ total: 0 }]),
  countAllEvents: vi.fn().mockResolvedValue([{ total: 0 }]), getEventById: vi.fn(), updateEvent: vi.fn(),
  deleteEvent: vi.fn(), upsertRsvp: vi.fn(), getEventRsvpCounts: vi.fn().mockResolvedValue([]),
  findEventsByUid: vi.fn(), createEvent: vi.fn(),
}));
vi.mock('../../db/queries/advanced.js', () => ({ createEventTransactional: vi.fn(), callGetRSOStats: vi.fn() }));
vi.mock('../../db/queries/rso.js', () => ({
  getMembership: vi.fn().mockResolvedValue({ role: 'Board' }), getUserMemberships: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(), inviteUser: vi.fn(),
}));

const app = (await import('../../app.js')).default;
const { signToken } = await import('../../middleware/auth.js');
const admin = `via_token=${signToken({ net_id: 'boss', is_global_admin: 1 })}`;

const calendarOf = (bytes) =>
  'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:' + 'x'.repeat(bytes) + '\r\nEND:VEVENT\r\nEND:VCALENDAR';

describe('request body limits', () => {
  /**
   * A year of events for an active RSO exports to well over the 100kb that
   * body-parser allows by default, and the failure is an opaque 413 rather
   * than anything an admin could act on. The calendar endpoints get room to
   * work; everything else stays at the default.
   */
  it('accepts a calendar far larger than the default limit', async () => {
    const res = await request(app).post('/api/v1/events/import')
      .set('Cookie', admin).send({ rso_id: 1, preview: true, ics: calendarOf(400_000) });
    expect(res.status).toBe(200);
  });

  it('still refuses a calendar beyond any plausible size', async () => {
    const res = await request(app).post('/api/v1/events/import')
      .set('Cookie', admin).send({ rso_id: 1, preview: true, ics: calendarOf(3_000_000) });
    expect(res.status).toBe(413);
  });

  it('leaves ordinary endpoints at the smaller default', async () => {
    const res = await request(app).post('/api/v1/events')
      .set('Cookie', admin).send({ title: 'x'.repeat(400_000) });
    expect(res.status).toBe(413);
  });
});
