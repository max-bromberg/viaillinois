import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/queries/locations.js', () => ({ getByCapacity: vi.fn() }));
vi.mock('../../db/queries/events.js', () => ({ getPublicEvents: vi.fn() }));
vi.mock('../../db/queries/midterms.js', () => ({ getConfirmedMidtermsForScheduler: vi.fn() }));
vi.mock('../../db/queries/courses.js', () => ({ getSectionsForCourses: vi.fn() }));
vi.mock('../../db/queries/facilityReservations.js', () => ({ getReservationsInRange: vi.fn() }));

import { recommend } from '../../services/intelligentScheduler.js';
import { getByCapacity } from '../../db/queries/locations.js';
import { getPublicEvents } from '../../db/queries/events.js';
import { getConfirmedMidtermsForScheduler } from '../../db/queries/midterms.js';
import { getSectionsForCourses } from '../../db/queries/courses.js';
import { getReservationsInRange } from '../../db/queries/facilityReservations.js';

/**
 * A slot that begins in the evening and ends after midnight.
 *
 * The search was made fast by indexing events and reservations by day, so a
 * slot reads its own day rather than the whole term. A row running past
 * midnight is filed under every day it touches, which is right, and a slot
 * running past midnight was still only ever asked about the day it starts on,
 * which is not: everything after midnight was invisible to it. The scheduler
 * then recommended a room that was already booked, and said "No competing RSO
 * events" while doing it, which is worse than recommending nothing.
 *
 * It is reachable from the dashboard without anything unusual: the duration
 * list offers three hours and the last hour may be set as late as 23.
 */
const BUILDING = 'Electrical & Computer Eng Bldg';
const ROOM = '2013';

// A fixed evening, far enough ahead that nothing filters it out for being past,
// and away from either daylight saving change so that neither is what is
// under test here.
const EVENING = new Date(Date.now() + 30 * 86_400_000);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DAY = ymd(EVENING);
const NEXT_DAY = ymd(new Date(EVENING.getTime() + 86_400_000));

const PARAMS = {
  durationMinutes: 180,
  dateRange: { start: DAY, end: DAY },
  timeConstraint: { startHour: 20, endHour: 23, tier: 'strongly_preferred' },
  expectedAttendance: 20,
};

/** Every option this search offered for the room, as "HH:MM" of its start. */
const startsOffered = result => (result.allOptions ?? [])
  .filter(option => option.location?.room_number === ROOM)
  .map(option => String(option.start).slice(11, 16));

beforeEach(() => {
  getByCapacity.mockResolvedValue([
    { location_id: 1, building: BUILDING, room_number: ROOM, max_capacity: 60 },
  ]);
  getPublicEvents.mockResolvedValue([]);
  getConfirmedMidtermsForScheduler.mockResolvedValue([]);
  getSectionsForCourses.mockResolvedValue([]);
  getReservationsInRange.mockResolvedValue([]);
});

describe('a slot that runs past midnight', () => {
  it('sees an event that starts after midnight in the room it is considering', async () => {
    getPublicEvents.mockResolvedValue([{
      event_id: 11, rso_id: 1, title: 'Late build session',
      building: BUILDING, room_number: ROOM,
      start_time: `${NEXT_DAY} 00:15:00`, end_time: `${NEXT_DAY} 02:00:00`,
    }]);

    const result = await recommend(PARAMS);

    // 22:00 to 01:00 overlaps the 00:15 event, so the room is taken then.
    expect(startsOffered(result)).not.toContain('22:00');
    expect(startsOffered(result)).not.toContain('22:30');
    expect(startsOffered(result)).not.toContain('23:00');
  });

  it('sees a reservation that starts after midnight in that room', async () => {
    // A reservation names the room by its identifier, which is what the
    // occupancy check reads, and the building by name for the building level
    // scoring beside it.
    getReservationsInRange.mockResolvedValue([{
      reservation_id: 3, location_id: 1, building: BUILDING,
      start_time: `${NEXT_DAY} 00:00:00`, end_time: `${NEXT_DAY} 02:00:00`,
    }]);

    const result = await recommend(PARAMS);

    expect(startsOffered(result)).not.toContain('22:00');
    expect(startsOffered(result)).not.toContain('23:00');
  });

  it('still offers a slot that ends before the booking begins', async () => {
    getReservationsInRange.mockResolvedValue([{
      reservation_id: 3, location_id: 1, building: BUILDING,
      start_time: `${NEXT_DAY} 00:00:00`, end_time: `${NEXT_DAY} 02:00:00`,
    }]);

    const result = await recommend(PARAMS);

    // 21:00 to 00:00 ends exactly as the reservation starts, which is not a
    // clash, so the room is genuinely free for it.
    expect(startsOffered(result)).toContain('21:00');
  });

  it('is unchanged for a slot that stays inside its own day', async () => {
    getPublicEvents.mockResolvedValue([{
      event_id: 12, rso_id: 1, title: 'Evening meeting',
      building: BUILDING, room_number: ROOM,
      start_time: `${DAY} 20:30:00`, end_time: `${DAY} 21:30:00`,
    }]);

    const result = await recommend({
      ...PARAMS,
      durationMinutes: 60,
      timeConstraint: { startHour: 19, endHour: 22, tier: 'strongly_preferred' },
    });

    expect(startsOffered(result)).not.toContain('20:00');
    expect(startsOffered(result)).not.toContain('21:00');
    expect(startsOffered(result)).toContain('19:00');
  });
});
