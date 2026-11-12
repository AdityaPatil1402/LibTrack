import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client, cleanupTestUsers, createTestBook, giveIssue, pool, query, signedInClient, startServer } from './helpers.js';

let srv;

before(async () => {
  await cleanupTestUsers();
  srv = await startServer({
    rateLimits: { loginPerAccountLimit: 1000, loginPerIpLimit: 1000, signupLimit: 1000, passwordChangeLimit: 1000 },
  });
});

after(async () => {
  await srv.close();
  await cleanupTestUsers();
  await pool.end();
});

const activeCount = async (userId) =>
  (await query(`SELECT count(*) AS n FROM issues WHERE user_id = $1 AND status = 'ACTIVE'`, [userId])).rows[0].n;
const copyStatus = async (copyId) => (await query('SELECT status FROM book_copies WHERE id = $1', [copyId])).rows[0].status;
const issue = (client, book) => client.post('/api/issues', { bookId: book.id });

/** Puts `n` ACTIVE issues on a member, each on a different throw-away title. */
async function giveActiveIssues(userId, n, { overdueFirst = false } = {}) {
  const books = [];
  for (let i = 0; i < n; i += 1) {
    const book = await createTestBook({ copies: 'AA' });
    await giveIssue(userId, book, book.copies[0], { dueInDays: overdueFirst && i === 0 ? -2 : 10 });
    books.push(book);
  }
  return books;
}

describe('issuing a book', () => {
  test('1. a member with no issues can issue an available book (copy, issue and event all recorded)', async () => {
    const { client, user } = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'AA' });

    const res = await issue(client, book);
    assert.equal(res.status, 201, res.text);
    const { issue: made, borrowing } = res.json;
    assert.equal(made.bookId, book.id);
    assert.equal(made.copyCode, book.copies[0].copy_code, 'lowest available copy is assigned');
    assert.deepEqual(borrowing, { activeCount: 1, maxActiveIssues: 5, availableSlots: 4 });

    assert.equal(await copyStatus(book.copies[0].id), 'ISSUED');
    assert.equal(await copyStatus(book.copies[1].id), 'AVAILABLE', 'only one copy is taken');

    // Due date = 14 calendar days from today in the library timezone (Asia/Kolkata).
    const { rows } = await query(
      `SELECT (due_date = (now() AT TIME ZONE 'Asia/Kolkata')::date + 14) AS ok, status FROM issues WHERE id = $1`,
      [made.id]
    );
    assert.equal(rows[0].ok, true);
    assert.equal(rows[0].status, 'ACTIVE');

    // 12. The transaction event is complete.
    const { rows: events } = await query('SELECT * FROM transaction_events WHERE issue_id = $1', [made.id]);
    assert.equal(events.length, 1);
    const event = events[0];
    assert.equal(event.event_type, 'BOOK_ISSUED');
    assert.equal(event.user_id, user.id);
    assert.equal(event.book_id, book.id);
    assert.equal(event.copy_id, book.copies[0].id);
    assert.equal(event.previous_state.copyStatus, 'AVAILABLE');
    assert.equal(event.new_state.copyStatus, 'ISSUED');
    assert.equal(event.new_state.copyCode, book.copies[0].copy_code);
    assert.ok(event.occurred_at);

    const { rows: notes } = await query(`SELECT type FROM notifications WHERE issue_id = $1`, [made.id]);
    assert.deepEqual(notes.map((n) => n.type), ['ISSUE_SUCCESS']);
  });

  test('2. a member with four active issues can issue a fifth', async () => {
    const { client, user } = await signedInClient(srv.base);
    await giveActiveIssues(user.id, 4);
    const book = await createTestBook({ copies: 'A' });
    const res = await issue(client, book);
    assert.equal(res.status, 201, res.text);
    assert.equal(res.json.borrowing.activeCount, 5);
    assert.equal(res.json.borrowing.availableSlots, 0);
    assert.equal(await activeCount(user.id), 5);
  });

  test('3. a member with five active issues is rejected for a sixth, and nothing changes', async () => {
    const { client, user } = await signedInClient(srv.base);
    await giveActiveIssues(user.id, 5);
    const book = await createTestBook({ copies: 'AA' });
    const res = await issue(client, book);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'LIMIT_REACHED');
    assert.equal(await activeCount(user.id), 5);
    assert.equal(await copyStatus(book.copies[0].id), 'AVAILABLE');
    const { rows } = await query('SELECT 1 FROM transaction_events WHERE book_id = $1', [book.id]);
    assert.equal(rows.length, 0, 'a rejected request leaves no event');
  });

  test('4. an overdue active issue blocks a new issue even below the limit', async () => {
    const { client, user } = await signedInClient(srv.base);
    await giveActiveIssues(user.id, 2, { overdueFirst: true });
    const book = await createTestBook({ copies: 'AA' });
    const res = await issue(client, book);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'OVERDUE_BLOCKED');
    assert.equal(await activeCount(user.id), 2);
    assert.equal(await copyStatus(book.copies[0].id), 'AVAILABLE');
  });

  test('5. a member with no overdue issues and room left can issue (a book due today is not overdue)', async () => {
    const { client, user } = await signedInClient(srv.base);
    const [first] = await createTestBook({ copies: 'AA' }).then((b) => [b]);
    await giveIssue(user.id, first, first.copies[0], { dueInDays: 0 }); // due today: the fine starts tomorrow
    const book = await createTestBook({ copies: 'AA' });
    const res = await issue(client, book);
    assert.equal(res.status, 201, res.text);
  });

  test('6. no eligible copy: rejected for every non-AVAILABLE status', async () => {
    const { client, user } = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'IUDLW' });
    const res = await issue(client, book);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'NO_COPY_AVAILABLE');
    assert.equal(await activeCount(user.id), 0);
    const { rows } = await query(`SELECT status FROM book_copies WHERE book_id = $1 ORDER BY id`, [book.id]);
    assert.deepEqual(rows.map((r) => r.status), ['ISSUED', 'UNDER_INSPECTION', 'DAMAGED', 'LOST', 'WITHDRAWN']);
  });

  test('9. an inactive member cannot issue', async () => {
    const { client, user } = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'AA' });
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [user.id]);
    const res = await issue(client, book);
    assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
    assert.equal(await activeCount(user.id), 0);
    assert.equal(await copyStatus(book.copies[0].id), 'AVAILABLE');
  });

  test('10. an archived title cannot be issued, and an unknown title is a 404', async () => {
    const { client, user } = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'AA', archived: true });
    const res = await issue(client, book);
    assert.equal(res.status, 409);
    assert.equal(res.json.code, 'BOOK_ARCHIVED');
    assert.equal(await activeCount(user.id), 0);

    assert.equal((await client.post('/api/issues', { bookId: 99999999 })).status, 404);
  });

  test('rejects a missing or malformed book id, and requires sign-in and a CSRF token', async () => {
    const { client } = await signedInClient(srv.base);
    assert.equal((await client.post('/api/issues', {})).status, 400);
    assert.equal((await client.post('/api/issues', { bookId: 'abc' })).status, 400);
    assert.equal((await client.post('/api/issues', { bookId: -3 })).status, 400);

    const anon = new Client(srv.base);
    assert.equal((await anon.post('/api/issues', { bookId: 1 })).status, 401);

    const book = await createTestBook({ copies: 'A' });
    const noCsrf = await client.raw('POST', '/api/issues', { body: { bookId: book.id }, csrf: false });
    assert.equal(noCsrf.status, 403);
    assert.equal(await copyStatus(book.copies[0].id), 'AVAILABLE');
  });
});

describe('concurrency', () => {
  test('7. two members racing for the last copy: exactly one wins', async () => {
    const a = await signedInClient(srv.base);
    const b = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'A' });

    const [ra, rb] = await Promise.all([issue(a.client, book), issue(b.client, book)]);
    const statuses = [ra.status, rb.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    assert.equal(loser.json.code, 'NO_COPY_AVAILABLE');

    const { rows } = await query(`SELECT user_id FROM issues WHERE copy_id = $1 AND status = 'ACTIVE'`, [book.copies[0].id]);
    assert.equal(rows.length, 1, 'the copy has exactly one active issue');
    assert.equal(await copyStatus(book.copies[0].id), 'ISSUED');
  });

  test('7b. many members racing for a title with 3 copies: exactly 3 win, on 3 different copies', async () => {
    const members = await Promise.all([1, 2, 3, 4, 5, 6].map(() => signedInClient(srv.base)));
    const book = await createTestBook({ copies: 'AAA' });
    const results = await Promise.all(members.map((m) => issue(m.client, book)));
    assert.equal(results.filter((r) => r.status === 201).length, 3);
    assert.equal(results.filter((r) => r.status === 409).length, 3);
    const { rows } = await query(`SELECT DISTINCT copy_id FROM issues WHERE book_id = $1 AND status = 'ACTIVE'`, [book.id]);
    assert.equal(rows.length, 3);
  });

  test('8. one member firing many requests at once can never exceed five active issues', async () => {
    const { client, user } = await signedInClient(srv.base);
    const books = await Promise.all(Array.from({ length: 8 }, () => createTestBook({ copies: 'AA' })));
    const results = await Promise.all(books.map((book) => issue(client, book)));
    assert.equal(results.filter((r) => r.status === 201).length, 5);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.json.code === 'LIMIT_REACHED'));
    assert.equal(await activeCount(user.id), 5);
  });

  test('8b. racing from four issues: exactly one more succeeds', async () => {
    const { client, user } = await signedInClient(srv.base);
    await giveActiveIssues(user.id, 4);
    const books = await Promise.all(Array.from({ length: 4 }, () => createTestBook({ copies: 'AA' })));
    const results = await Promise.all(books.map((book) => issue(client, book)));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(await activeCount(user.id), 5);
  });
});

describe('issue eligibility preview', () => {
  test('reports what would happen without changing anything', async () => {
    const { client, user } = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'AA' });

    const ok = await client.get(`/api/issues/eligibility?bookId=${book.id}`);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.canIssue, true);
    assert.equal(ok.json.blocker, null);
    assert.equal(ok.json.loanPeriodDays, 14);
    assert.deepEqual(ok.json.borrowing, { activeCount: 0, overdueCount: 0, maxActiveIssues: 5, availableSlots: 5 });
    assert.equal(await copyStatus(book.copies[0].id), 'AVAILABLE');

    await giveActiveIssues(user.id, 1, { overdueFirst: true });
    const blocked = await client.get(`/api/issues/eligibility?bookId=${book.id}`);
    assert.equal(blocked.json.canIssue, false);
    assert.equal(blocked.json.blocker.code, 'OVERDUE_BLOCKED');

    assert.equal((await client.get('/api/issues/eligibility')).status, 400);
    assert.equal((await client.get('/api/issues/eligibility?bookId=99999999')).status, 404);
  });
});

describe('My Books', () => {
  test('11. shows only the signed-in member’s own records', async () => {
    const a = await signedInClient(srv.base);
    const b = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'AA' });
    const made = await issue(a.client, book);
    assert.equal(made.status, 201);

    const mine = await a.client.get('/api/issues/mine');
    assert.equal(mine.status, 200);
    assert.equal(mine.json.active.length, 1);
    const card = mine.json.active[0];
    assert.equal(card.issueId, made.json.issue.id);
    assert.equal(card.copyCode, book.copies[0].copy_code);
    assert.equal(card.book.title, book.title);
    assert.equal(card.status, 'ON_LOAN');
    assert.equal(card.daysUntilDue, 14);
    assert.equal(card.accruedFine, 0);
    assert.deepEqual(card.renewal, { eligible: true, status: 'AVAILABLE', label: 'Renewal available' });
    assert.deepEqual(mine.json.history, []);

    // Another member sees nothing of it, and cannot ask for it by id.
    const theirs = await b.client.get('/api/issues/mine');
    assert.equal(theirs.json.active.length, 0);
    const sneaky = await b.client.get(`/api/issues/mine?userId=${a.user.id}`);
    assert.equal(sneaky.json.active.length, 0, 'a userId in the query string is ignored');
    assert.ok(!JSON.stringify(theirs.json).includes(book.copies[0].copy_code));

    assert.equal((await new Client(srv.base).get('/api/issues/mine')).status, 401);
  });

  test('flags overdue and due-soon loans and accrues ₹2 per day after the due date', async () => {
    const { client, user } = await signedInClient(srv.base);
    const overdue = await createTestBook({ copies: 'A' });
    const soon = await createTestBook({ copies: 'A' });
    const today = await createTestBook({ copies: 'A' });
    await giveIssue(user.id, overdue, overdue.copies[0], { dueInDays: -4 });
    await giveIssue(user.id, soon, soon.copies[0], { dueInDays: 2 });
    await giveIssue(user.id, today, today.copies[0], { dueInDays: 0 });

    const { json } = await client.get('/api/issues/mine');
    const byTitle = Object.fromEntries(json.active.map((c) => [c.book.title, c]));
    assert.equal(byTitle[overdue.title].status, 'OVERDUE');
    assert.equal(byTitle[overdue.title].overdueDays, 4);
    assert.equal(byTitle[overdue.title].accruedFine, 8);
    assert.equal(byTitle[overdue.title].renewal.eligible, false);
    assert.equal(byTitle[soon.title].status, 'DUE_SOON');
    assert.equal(byTitle[today.title].status, 'DUE_SOON');
    assert.equal(byTitle[today.title].accruedFine, 0);
    assert.equal(json.active[0].book.title, overdue.title, 'sorted by due date, most urgent first');
  });
});

describe('dashboard and existing catalogue after issuing', () => {
  test('13. dashboard figures follow the real issues', async () => {
    const { client } = await signedInClient(srv.base);
    const before = await client.get('/api/dashboard/summary');
    assert.deepEqual(before.json.borrowing, { currentlyBorrowed: 0, maxActiveIssues: 5, availableSlots: 5 });

    const book = await createTestBook({ copies: 'AA' });
    assert.equal((await issue(client, book)).status, 201);

    const after = await client.get('/api/dashboard/summary');
    assert.deepEqual(after.json.borrowing, { currentlyBorrowed: 1, maxActiveIssues: 5, availableSlots: 4 });
    assert.equal(after.json.dueDates.upcomingCount, 1);
    assert.equal(after.json.dueDates.upcoming[0].title, book.title);
    assert.equal(after.json.dueDates.upcoming[0].daysUntilDue, 14);
    assert.equal(after.json.dueDates.overdueCount, 0);
    assert.equal(after.json.fines.outstanding, 0);
  });

  test('14. search, details and recommendations still work, and reflect the lower availability', async () => {
    const { client } = await signedInClient(srv.base);
    const book = await createTestBook({ copies: 'A' });

    const found = await client.get(`/api/catalogue/books?q=${encodeURIComponent(book.title)}`);
    assert.deepEqual(found.json.items.map((i) => i.id), [book.id]);

    assert.equal((await issue(client, book)).status, 201);

    const gone = await client.get(`/api/catalogue/books?q=${encodeURIComponent(book.title)}`);
    assert.equal(gone.json.items.length, 0, 'a title with no AVAILABLE copy leaves normal search');

    const details = await client.get(`/api/catalogue/books/${book.id}`);
    assert.equal(details.status, 200);
    assert.equal(details.json.book.availability.availableCopies, 0);
    assert.equal(details.json.book.availability.byStatus.ISSUED, 1);

    const recs = await client.get('/api/catalogue/recommendations');
    assert.equal(recs.status, 200);
    const ids = recs.json.sections.flatMap((s) => s.items.map((i) => i.id));
    assert.equal(new Set(ids).size, ids.length);
  });
});
