import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const recordDenial = vi.hoisted(() => vi.fn());
vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial,
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));

vi.mock('../../db/queries/users.js', () => ({
  getUserByNetId: vi.fn(), upsertUser: vi.fn(), getLocalAccount: vi.fn(),
}));

const calendarsDb = vi.hoisted(() => ({
  rotateCalendar: vi.fn(), setCalendarRsos: vi.fn(), getCalendarByTokenHash: vi.fn(),
}));
vi.mock('../../db/queries/personalCalendars.ts', () => calendarsDb);

const reads = vi.hoisted(() => ({
  listRsos: vi.fn(), getRso: vi.fn(), getRsoMembers: vi.fn(),
  listEvents: vi.fn(), countEvents: vi.fn(), listMidterms: vi.fn(),
  searchCourses: vi.fn(), listRoomsInBuilding: vi.fn(), getSectionsOccupying: vi.fn(),
}));
vi.mock('../../db/queries/internalReads.ts', () => reads);

// Read as the module loads, and set low so that a handful of requests is
// enough to meet the ceiling inside one test.
process.env.PERSONAL_CALENDAR_REQUESTS_PER_HOUR = '3';

const app = (await import('../../app.js')).default;

const GOOD = 'a'.repeat(43);
const address = token => `/calendar/personal/${token}.ics`;

beforeEach(() => {
  vi.clearAllMocks();
  calendarsDb.getCalendarByTokenHash.mockResolvedValue({ netId: 'rgarcia7', rsoIds: null });
  reads.listEvents.mockResolvedValue([]);
});

/**
 * The personal calendar is the one public address whose whole credential is
 * the address itself, and it is deliberately outside the public API budget
 * because a phone asking for one student's calendar is not the traffic that
 * budget exists to shape. Outside every budget, though, it would be the one
 * endpoint anybody could ask for as fast as they liked, once per guessed
 * token. A generous ceiling per address leaves a phone alone and stops that.
 */
describe('the personal calendar, under load from one address', () => {
  it('answers the first requests and then asks the caller to wait', async () => {
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get(address(GOOD))).status).toBe(200);
    }
    const refused = await request(app).get(address(GOOD));
    expect(refused.status).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
  });

  it('counts a guess at a token that nobody holds, which is what makes guessing slow', async () => {
    for (let i = 0; i < 4; i++) await request(app).get(address('z'.repeat(43)));
    const refused = await request(app).get(address('y'.repeat(43)));
    expect(refused.status).toBe(429);
    expect(recordDenial).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'rate_limited' })
    );
  });
});
