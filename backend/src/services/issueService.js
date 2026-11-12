import { query, withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';
import { getCirculationConfig } from './configService.js';

const RULE_ERRORS = {
  ACCOUNT_INACTIVE: [403, 'Your account is deactivated, so you cannot issue books.'],
  BOOK_ARCHIVED: [409, 'This title has been archived and cannot be issued.'],
  NO_COPY_AVAILABLE: [409, 'No copy of this book is available to issue right now.'],
};

/**
 * The borrowing rules, in one place. Returns the first rule that blocks an issue, or null.
 * Order matters for the message the member sees: overdue books are the most actionable.
 */
function findBlocker({ isActive, isArchived, activeCount, overdueCount, maxActiveIssues, availableCopies }) {
  if (!isActive) return { code: 'ACCOUNT_INACTIVE', status: RULE_ERRORS.ACCOUNT_INACTIVE[0], message: RULE_ERRORS.ACCOUNT_INACTIVE[1] };
  if (isArchived) return { code: 'BOOK_ARCHIVED', status: RULE_ERRORS.BOOK_ARCHIVED[0], message: RULE_ERRORS.BOOK_ARCHIVED[1] };
  if (overdueCount > 0) {
    return {
      code: 'OVERDUE_BLOCKED',
      status: 409,
      message: `You have ${overdueCount} overdue ${overdueCount === 1 ? 'book' : 'books'}. Resolve ${overdueCount === 1 ? 'it' : 'them'} before issuing another book.`,
    };
  }
  if (activeCount >= maxActiveIssues) {
    return {
      code: 'LIMIT_REACHED',
      status: 409,
      message: `You already have ${activeCount} books issued, which is the maximum of ${maxActiveIssues}. Return a book to issue another.`,
    };
  }
  if (availableCopies < 1) return { code: 'NO_COPY_AVAILABLE', status: RULE_ERRORS.NO_COPY_AVAILABLE[0], message: RULE_ERRORS.NO_COPY_AVAILABLE[1] };
  return null;
}

const toError = (blocker) => new HttpError(blocker.status, blocker.message, { code: blocker.code });

async function borrowingCounts(db, userId, timezone) {
  const { rows } = await db.query(
    `SELECT count(*) AS active,
            count(*) FILTER (WHERE due_date < (now() AT TIME ZONE $2)::date) AS overdue
       FROM issues WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId, timezone]
  );
  return { activeCount: rows[0].active, overdueCount: rows[0].overdue };
}

const dueDateFromToday = async (db, timezone, days) => {
  const { rows } = await db.query(`SELECT ((now() AT TIME ZONE $1)::date + $2::int) AS due`, [timezone, days]);
  return rows[0].due;
};

/**
 * Read-only preview used to prefill the Issue Book page and disable the button when a rule
 * already blocks the issue. It is NOT authoritative: issueBook() re-checks everything under locks.
 */
export async function getIssueEligibility(userId, bookId) {
  const config = await getCirculationConfig();
  const { rows: bookRows } = await query(
    `SELECT b.id, b.is_archived,
            (SELECT count(*) FROM book_copies c WHERE c.book_id = b.id AND c.status = 'AVAILABLE') AS available
       FROM books b WHERE b.id = $1`,
    [bookId]
  );
  if (bookRows.length === 0) throw new HttpError(404, 'That book could not be found.', { code: 'BOOK_NOT_FOUND' });
  const { rows: userRows } = await query('SELECT is_active FROM users WHERE id = $1', [userId]);

  const counts = await borrowingCounts({ query }, userId, config.timezone);
  const blocker = findBlocker({
    isActive: userRows[0]?.is_active === true,
    isArchived: bookRows[0].is_archived,
    ...counts,
    maxActiveIssues: config.maxActiveIssues,
    availableCopies: bookRows[0].available,
  });

  return {
    canIssue: blocker === null,
    blocker: blocker && { code: blocker.code, message: blocker.message },
    borrowing: {
      activeCount: counts.activeCount,
      overdueCount: counts.overdueCount,
      maxActiveIssues: config.maxActiveIssues,
      availableSlots: Math.max(0, config.maxActiveIssues - counts.activeCount),
    },
    loanPeriodDays: config.loanPeriodDays,
    dueDateIfIssuedToday: await dueDateFromToday({ query }, config.timezone, config.loanPeriodDays),
    timezone: config.timezone,
  };
}

/**
 * Issues one physical copy of a title to a member. Everything happens in ONE transaction:
 *   1. lock the member's row  -> concurrent requests by the same member run one at a time,
 *      so the 5-book limit and the overdue rule cannot be bypassed;
 *   2. lock the title's copy rows (always in id order, so no deadlocks) -> two members can
 *      never be handed the same copy;
 *   3. re-check every rule, assign a copy, create the issue, write the BOOK_ISSUED event
 *      and the confirmation notification.
 * Any failure rolls all of it back. A unique index on active issues per copy is the last safety net.
 */
export async function issueBook(userId, bookId) {
  const config = await getCirculationConfig();

  try {
    return await withTransaction(async (client) => {
      const { rows: userRows } = await client.query(
        'SELECT id, is_active FROM users WHERE id = $1 FOR NO KEY UPDATE',
        [userId]
      );
      if (userRows.length === 0) throw new HttpError(401, 'Please sign in to continue.', { code: 'UNAUTHENTICATED' });

      const { rows: bookRows } = await client.query(
        `SELECT b.id, b.title, b.is_archived, a.name AS author
           FROM books b JOIN authors a ON a.id = b.author_id
          WHERE b.id = $1
            FOR SHARE OF b`,
        [bookId]
      );
      if (bookRows.length === 0) throw new HttpError(404, 'That book could not be found.', { code: 'BOOK_NOT_FOUND' });
      const book = bookRows[0];

      const { rows: copies } = await client.query(
        'SELECT id, copy_code, status FROM book_copies WHERE book_id = $1 ORDER BY id FOR UPDATE',
        [bookId]
      );
      const copy = copies.find((c) => c.status === 'AVAILABLE');

      const counts = await borrowingCounts(client, userId, config.timezone);
      const blocker = findBlocker({
        isActive: userRows[0].is_active,
        isArchived: book.is_archived,
        ...counts,
        maxActiveIssues: config.maxActiveIssues,
        availableCopies: copy ? 1 : 0,
      });
      if (blocker) throw toError(blocker);

      const updated = await client.query(
        `UPDATE book_copies SET status = 'ISSUED' WHERE id = $1 AND status = 'AVAILABLE'`,
        [copy.id]
      );
      if (updated.rowCount !== 1) throw toError({ code: 'NO_COPY_AVAILABLE', status: 409, message: RULE_ERRORS.NO_COPY_AVAILABLE[1] });

      const { rows: issueRows } = await client.query(
        `INSERT INTO issues (user_id, book_id, copy_id, due_date)
         VALUES ($1, $2, $3, (now() AT TIME ZONE $4)::date + $5::int)
         RETURNING id, issued_at, due_date`,
        [userId, bookId, copy.id, config.timezone, config.loanPeriodDays]
      );
      const issue = issueRows[0];

      await client.query(
        `INSERT INTO transaction_events
           (event_type, user_id, actor_user_id, book_id, copy_id, issue_id, previous_state, new_state)
         VALUES ('BOOK_ISSUED', $1, $1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
          userId,
          bookId,
          copy.id,
          issue.id,
          JSON.stringify({ copyStatus: 'AVAILABLE' }),
          JSON.stringify({
            copyStatus: 'ISSUED',
            copyCode: copy.copy_code,
            bookTitle: book.title,
            issueStatus: 'ACTIVE',
            dueDate: issue.due_date,
          }),
        ]
      );

      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, book_id, issue_id, dedupe_key)
         VALUES ($1, 'ISSUE_SUCCESS', 'Book issued', $2, $3, $4, $5)`,
        [
          userId,
          `You borrowed "${book.title}" (copy ${copy.copy_code}). It is due on ${issue.due_date}.`,
          bookId,
          issue.id,
          `issue-success:${issue.id}`,
        ]
      );

      return {
        issue: {
          id: issue.id,
          bookId,
          title: book.title,
          author: book.author,
          copyCode: copy.copy_code,
          issuedAt: issue.issued_at,
          dueDate: issue.due_date,
          loanPeriodDays: config.loanPeriodDays,
        },
        borrowing: {
          activeCount: counts.activeCount + 1,
          maxActiveIssues: config.maxActiveIssues,
          availableSlots: Math.max(0, config.maxActiveIssues - counts.activeCount - 1),
        },
      };
    });
  } catch (err) {
    // The unique index "one active issue per copy" fired: another request won the copy.
    if (err?.code === '23505' && err.constraint === 'issues_one_active_per_copy_uq') {
      throw toError({ code: 'NO_COPY_AVAILABLE', status: 409, message: RULE_ERRORS.NO_COPY_AVAILABLE[1] });
    }
    throw err;
  }
}

const DUE_SOON_DAYS = 3;

/** The member's own borrowing records. The user id always comes from the session, never the request. */
export async function getMyBooks(userId) {
  const { finePerDayInr, maxActiveIssues, timezone } = await getCirculationConfig();

  const { rows: activeRows } = await query(
    `WITH today AS (SELECT (now() AT TIME ZONE $2)::date AS d)
     SELECT i.id, i.issued_at, i.due_date, i.renewal_count, i.renewed_at,
            (i.due_date - (SELECT d FROM today)) AS days_until_due,
            b.id AS book_id, b.title, b.cover_url, a.name AS author, g.name AS genre, c.copy_code
       FROM issues i
       JOIN books b ON b.id = i.book_id
       JOIN authors a ON a.id = b.author_id
       JOIN genres g ON g.id = b.genre_id
       JOIN book_copies c ON c.id = i.copy_id
      WHERE i.user_id = $1 AND i.status = 'ACTIVE'
      ORDER BY i.due_date, i.id`,
    [userId, timezone]
  );

  const active = activeRows.map((r) => {
    const isOverdue = r.days_until_due < 0;
    const overdueDays = isOverdue ? -r.days_until_due : 0;
    let renewal;
    if (r.renewal_count > 0) renewal = { eligible: false, status: 'USED', label: 'Renewal used' };
    else if (isOverdue) renewal = { eligible: false, status: 'OVERDUE', label: 'Not renewable: overdue' };
    else renewal = { eligible: true, status: 'AVAILABLE', label: 'Renewal available' };

    return {
      issueId: r.id,
      book: { id: r.book_id, title: r.title, author: r.author, genre: r.genre, coverUrl: r.cover_url },
      copyCode: r.copy_code,
      issuedAt: r.issued_at,
      dueDate: r.due_date,
      status: isOverdue ? 'OVERDUE' : r.days_until_due <= DUE_SOON_DAYS ? 'DUE_SOON' : 'ON_LOAN',
      daysUntilDue: r.days_until_due,
      overdueDays,
      accruedFine: overdueDays * finePerDayInr,
      renewal,
    };
  });

  const { rows: historyRows } = await query(
    `SELECT i.id, i.status, i.issued_at, i.due_date, i.returned_at, i.lost_at,
            b.id AS book_id, b.title, b.cover_url, a.name AS author, c.copy_code,
            f.amount_inr AS fine
       FROM issues i
       JOIN books b ON b.id = i.book_id
       JOIN authors a ON a.id = b.author_id
       JOIN book_copies c ON c.id = i.copy_id
       LEFT JOIN fines f ON f.issue_id = i.id
      WHERE i.user_id = $1 AND i.status <> 'ACTIVE'
      ORDER BY coalesce(i.returned_at, i.lost_at) DESC, i.id DESC
      LIMIT 100`,
    [userId]
  );

  const history = historyRows.map((r) => ({
    issueId: r.id,
    book: { id: r.book_id, title: r.title, author: r.author, coverUrl: r.cover_url },
    copyCode: r.copy_code,
    status: r.status,
    issuedAt: r.issued_at,
    dueDate: r.due_date,
    closedAt: r.returned_at ?? r.lost_at,
    fine: r.fine === null ? null : Number(r.fine),
  }));

  return { timezone, maxActiveIssues, finePerDay: finePerDayInr, active, history };
}
