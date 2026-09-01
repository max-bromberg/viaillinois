import { apiFetch } from './base.js';

/**
 * Import events or midterms from the contents of an .ics file.
 *
 * The file is read in the browser and its text is posted, so there is no
 * upload endpoint and nothing is written to disk on the server.
 *
 * @param {{kind: 'events'|'midterms', ics: string, rsoId?: number, preview?: boolean}} params
 */
export const importCalendar = ({ kind, ics, rsoId, preview = false }) =>
  apiFetch(`/api/v1/${kind}/import`, {
    method: 'POST',
    body: kind === 'events' ? { rso_id: rsoId, ics, preview } : { ics, preview },
  });
