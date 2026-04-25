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
 *   midtermSensitivity: 'low'|'medium'|'high'
 * }} params
 * @returns {Promise<{ curatedPicks: object[], allOptions: object[] }>}
 */
export function recommend(params) {
  return apiFetch('/api/v1/scheduler/recommend', {
    method: 'POST',
    body: params,
  });
}
