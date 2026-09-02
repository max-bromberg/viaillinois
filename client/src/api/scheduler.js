import { apiFetch } from './base.js';

/**
 * Get intelligent event recommendations.
 * @param {{
 *   attendance: number,
 *   durationMinutes: number,
 *   dateRange: { start: string, end: string },
 *   timeConstraint: { startHour: number, endHour: number, tier: string } | null,
 *   dayConstraints: Array<{ day: string, tier: string }>,
 *   venueConstraints: { buildings: Array<{ building: string, tier: string }>, specificRoom: object|null },
 *   excludedRooms: Array<{ location_id: number, building: string, room_number: string }>,
 *   targetCourses: string[],
 *   midtermSensitivity: 'low'|'medium'|'high',
 *   recurrence: { intervalWeeks: number, daysOfWeek: string[], until: string } | null
 * }} params
 *   With a recurrence, a candidate is a weekday and an hour scored across every
 *   week it would run, and each recommendation says how many of those weeks are
 *   clear.
 * @returns {Promise<{ curatedPicks: object[], allOptions: object[] }>}
 */
export function recommend(params) {
  return apiFetch('/api/v1/scheduler/recommend', {
    method: 'POST',
    body: params,
  });
}
