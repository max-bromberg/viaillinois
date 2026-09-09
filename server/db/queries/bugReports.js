import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../client.ts';
import { bugReports } from '../schema/schema.ts';

/**
 * Bug reports, from the form in About.
 *
 * Written with Drizzle, which is the direction the data layer is moving in.
 */

/**
 * Record a report.
 *
 * @param {{ reported_by: string|null, area: string, summary: string,
 *           detail: string|null, contact: string|null, page: string|null }} report
 * @returns {Promise<{ insertId: number }>}
 */
export async function createBugReport(report) {
  const [result] = await db.insert(bugReports).values({
    reportedBy: report.reported_by,
    area: report.area,
    summary: report.summary,
    detail: report.detail,
    contact: report.contact,
    page: report.page,
  });
  return { insertId: result.insertId };
}

/**
 * Every report, open ones first and newest first within that.
 *
 * An admin reading this page is looking for what still needs doing, and the
 * ones already dealt with are kept so that a report is not lost by being
 * answered.
 *
 * @returns {Promise<Array<object>>}
 */
export async function allBugReports() {
  return db
    .select({
      report_id: bugReports.reportId,
      reported_by: bugReports.reportedBy,
      area: bugReports.area,
      summary: bugReports.summary,
      detail: bugReports.detail,
      contact: bugReports.contact,
      page: bugReports.page,
      status: bugReports.status,
      created_at: bugReports.createdAt,
    })
    .from(bugReports)
    .orderBy(sql`${bugReports.status} = 'Closed'`, desc(bugReports.createdAt));
}

/**
 * Mark a report open or closed.
 *
 * @param {number} reportId
 * @param {'Open'|'Closed'} status
 * @returns {Promise<{ affectedRows: number }>}
 */
export async function setBugReportStatus(reportId, status) {
  const [result] = await db.update(bugReports)
    .set({ status })
    .where(and(eq(bugReports.reportId, reportId)));
  return { affectedRows: result.affectedRows };
}
