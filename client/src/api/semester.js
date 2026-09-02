import { apiFetch } from './base.js';

/**
 * The term the platform is in: when instruction runs, and the weeks inside it
 * that nobody is on campus.
 *
 * The event form defaults a repeat to the end of instruction and the scheduler
 * searches to the same date, so both read this rather than guessing.
 */
export function getCurrentSemester() {
  return apiFetch('/api/v1/semester/current');
}
