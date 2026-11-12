import { query } from '../db/pool.js';
import { getCirculationConfig } from './configService.js';

/**
 * Real, database-backed numbers for the signed-in member's dashboard.
 * "Today" is the calendar day in the library timezone, never the server's timezone.
 */
export async function getDashboardSummary(userId) {
  const { maxActiveIssues, finePerDayInr, timezone } = await getCirculationConfig();

  const { rows: issueRows } = await query(
    `WITH today AS (SELECT (now() AT TIME ZONE $2)::date AS d)
     SELECT i.id AS issue_id, i.due_date, i.renewal_count, b.id AS book_id, b.title, b.cover_url, a.name AS author,
            (i.due_date - (SELECT d FROM today)) AS days_until_due
       FROM issues i
       JOIN books b ON b.id = i.book_id
       JOIN authors a ON a.id = b.author_id
      WHERE i.user_id = $1 AND i.status = 'ACTIVE'
      ORDER BY i.due_date, i.id`,
    [userId, timezone]
  );

  // The due date itself is not overdue; the fine starts on the following calendar day.
  const overdue = issueRows.filter((r) => r.days_until_due < 0);
  const accruingFine = overdue.reduce((sum, r) => sum + -r.days_until_due * finePerDayInr, 0);

  // Fines already finalised on closed issues (returned late or lost), including any adjustments.
  const { rows: fineRows } = await query(
    `SELECT coalesce(sum(f.amount_inr + coalesce(adj.total, 0)), 0) AS total
       FROM fines f
       LEFT JOIN LATERAL (
         SELECT sum(amount_delta_inr) AS total FROM fine_adjustments WHERE fine_id = f.id
       ) adj ON TRUE
      WHERE f.user_id = $1 AND f.status = 'FINALIZED'`,
    [userId]
  );
  const finalizedFine = Number(fineRows[0].total);

  const upcoming = issueRows
    .filter((r) => r.days_until_due >= 0)
    .map((r) => ({
      issueId: r.issue_id,
      bookId: r.book_id,
      title: r.title,
      author: r.author,
      coverUrl: r.cover_url,
      dueDate: r.due_date,
      daysUntilDue: r.days_until_due,
    }));

  return {
    timezone,
    borrowing: {
      currentlyBorrowed: issueRows.length,
      maxActiveIssues,
      availableSlots: Math.max(0, maxActiveIssues - issueRows.length),
    },
    dueDates: {
      upcomingCount: upcoming.length,
      upcoming: upcoming.slice(0, 5),
      overdueCount: overdue.length,
    },
    fines: {
      currency: 'INR',
      finePerDay: finePerDayInr,
      outstanding: accruingFine + finalizedFine,
    },
  };
}
