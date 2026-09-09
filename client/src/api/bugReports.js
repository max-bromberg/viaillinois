import { apiFetch } from './base.js';

/**
 * Bug reports.
 *
 * Sending one is open, because a student should not have to sign in to say that
 * a page is broken. Reading them is a global admin's.
 */

/**
 * @param {{ area: string, summary: string, detail?: string, contact?: string, page?: string }} report
 */
export const submitBugReport = (report) =>
  apiFetch('/api/v1/bug-reports', { method: 'POST', body: report });

export const getBugReports = () => apiFetch('/api/v1/bug-reports');

export const setBugReportStatus = (reportId, status) =>
  apiFetch(`/api/v1/bug-reports/${reportId}`, { method: 'PATCH', body: { status } });
