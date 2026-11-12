import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Client, cleanupTestUsers, pool, query, signedInClient, startServer } from './helpers.js';

let srv;
let member; // { client, user }

before(async () => {
  await cleanupTestUsers();
  srv = await startServer({
    rateLimits: { loginPerAccountLimit: 1000, loginPerIpLimit: 1000, signupLimit: 1000, passwordChangeLimit: 1000 },
  });
  member = await signedInClient(srv.base);
});

after(async () => {
  await srv.close();
  await cleanupTestUsers();
  await pool.end();
});

describe('catalogue access', () => {
  test('requires a signed-in member', async () => {
    const anon = new Client(srv.base);
    for (const path of ['/api/catalogue/books', '/api/catalogue/filters', '/api/catalogue/recommendations', '/api/catalogue/books/1', '/api/dashboard/summary']) {
      const res = await anon.get(path);
      assert.equal(res.status, 401, path);
    }
  });
});

describe('catalogue search', () => {
  test('returns only non-archived titles that have an AVAILABLE copy, with real counts', async () => {
    const res = await member.client.get('/api/catalogue/books?pageSize=48');
    assert.equal(res.status, 200);
    assert.ok(res.json.items.length > 0, 'seeded catalogue should have available titles');

    const { rows } = await query(
      `SELECT b.id FROM books b
        WHERE NOT b.is_archived AND EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id AND c.status = 'AVAILABLE')`
    );
    assert.equal(res.json.total, rows.length);
    assert.deepEqual(res.json.items.map((i) => i.id).sort((a, b) => a - b), rows.map((r) => r.id).sort((a, b) => a - b));
    for (const item of res.json.items) {
      assert.ok(item.availableCopies > 0);
      assert.ok(item.totalCopies >= item.availableCopies);
    }
  });

  test('finds a title by partial title and by ISBN, ignoring case', async () => {
    const { rows } = await query(
      `SELECT b.id, b.title, b.isbn FROM books b
        WHERE NOT b.is_archived AND EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id AND c.status = 'AVAILABLE')
        ORDER BY b.id LIMIT 1`
    );
    const target = rows[0];

    const byTitle = await member.client.get(`/api/catalogue/books?q=${encodeURIComponent(target.title.slice(2, 8).toUpperCase())}`);
    assert.ok(byTitle.json.items.some((i) => i.id === target.id));

    const byIsbn = await member.client.get(`/api/catalogue/books?q=${encodeURIComponent(target.isbn.toLowerCase())}`);
    assert.deepEqual(byIsbn.json.items.map((i) => i.id), [target.id]);
  });

  test('treats % and _ in search text literally', async () => {
    const res = await member.client.get('/api/catalogue/books?q=%25');
    assert.equal(res.status, 200);
    assert.equal(res.json.items.length, 0);
  });

  test('filters by genre and author, and sorts by title', async () => {
    const filters = await member.client.get('/api/catalogue/filters');
    assert.equal(filters.status, 200);
    assert.ok(filters.json.genres.length > 0 && filters.json.authors.length > 0);

    const genre = filters.json.genres[0];
    const byGenre = await member.client.get(`/api/catalogue/books?genreId=${genre.id}&pageSize=48`);
    assert.equal(byGenre.json.total, genre.titleCount);
    assert.ok(byGenre.json.items.every((i) => i.genre === genre.name));

    const author = filters.json.authors[0];
    const byAuthor = await member.client.get(`/api/catalogue/books?authorId=${author.id}&pageSize=48`);
    assert.equal(byAuthor.json.total, author.titleCount);
    assert.ok(byAuthor.json.items.every((i) => i.author === author.name));

    const sorted = await member.client.get('/api/catalogue/books?sort=title&pageSize=48');
    // Compare with the database's own ordering so the test does not depend on the OS collation.
    const { rows: ordered } = await query(
      `SELECT b.id FROM books b
        WHERE NOT b.is_archived AND EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id AND c.status = 'AVAILABLE')
        ORDER BY lower(b.title), b.id`
    );
    assert.deepEqual(sorted.json.items.map((i) => i.id), ordered.map((r) => r.id));

    const recent = await member.client.get('/api/catalogue/books?sort=recent&pageSize=48');
    const { rows: newest } = await query(
      `SELECT b.id FROM books b
        WHERE NOT b.is_archived AND EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id AND c.status = 'AVAILABLE')
        ORDER BY b.created_at DESC, b.id DESC`
    );
    assert.deepEqual(recent.json.items.map((i) => i.id), newest.map((r) => r.id));
  });

  test('paginates without repeating titles', async () => {
    const first = await member.client.get('/api/catalogue/books?pageSize=5&page=1');
    const second = await member.client.get('/api/catalogue/books?pageSize=5&page=2');
    assert.equal(first.json.items.length, 5);
    assert.equal(first.json.totalPages, Math.ceil(first.json.total / 5));
    const ids = new Set([...first.json.items, ...second.json.items].map((i) => i.id));
    assert.equal(ids.size, first.json.items.length + second.json.items.length);

    const beyond = await member.client.get('/api/catalogue/books?pageSize=5&page=999');
    assert.equal(beyond.status, 200);
    assert.equal(beyond.json.items.length, 0);
    assert.equal(beyond.json.total, first.json.total);
  });

  test('rejects invalid query values', async () => {
    for (const q of ['sort=price', 'page=0', 'pageSize=500', 'genreId=abc']) {
      const res = await member.client.get(`/api/catalogue/books?${q}`);
      assert.equal(res.status, 400, q);
    }
  });
});

describe('book details', () => {
  test('returns full details and copy availability that match the database', async () => {
    const { rows } = await query('SELECT id FROM books ORDER BY id LIMIT 1');
    const res = await member.client.get(`/api/catalogue/books/${rows[0].id}`);
    assert.equal(res.status, 200);
    const book = res.json.book;
    assert.ok(book.title && book.author && book.genre && book.isbn && book.description);

    const { rows: counts } = await query(
      `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'AVAILABLE') AS available FROM book_copies WHERE book_id = $1`,
      [rows[0].id]
    );
    assert.equal(book.availability.totalCopies, counts[0].total);
    assert.equal(book.availability.availableCopies, counts[0].available);
  });

  test('404 for an unknown title and 400 for a malformed id', async () => {
    assert.equal((await member.client.get('/api/catalogue/books/99999999')).status, 404);
    assert.equal((await member.client.get('/api/catalogue/books/abc')).status, 400);
  });
});

describe('recommendations', () => {
  test('returns exactly 20 distinct, non-archived titles from the catalogue', async () => {
    const res = await member.client.get('/api/catalogue/recommendations');
    assert.equal(res.status, 200);
    const ids = res.json.sections.flatMap((s) => s.items.map((i) => i.id));
    assert.equal(new Set(ids).size, ids.length, 'no duplicates');

    const { rows } = await query('SELECT id FROM books WHERE NOT is_archived');
    const expected = Math.min(20, rows.length);
    assert.equal(ids.length, expected);
    assert.equal(res.json.total, expected);

    const eligible = new Set(rows.map((r) => r.id));
    assert.ok(ids.every((id) => eligible.has(id)));
    assert.ok(res.json.sections.some((s) => s.key === 'featured'));
  });
});

describe('dashboard summary', () => {
  test('a new member has no loans, 5 free slots, and no fines', async () => {
    const res = await member.client.get('/api/dashboard/summary');
    assert.equal(res.status, 200);
    assert.equal(res.json.timezone, 'Asia/Kolkata');
    assert.deepEqual(res.json.borrowing, { currentlyBorrowed: 0, maxActiveIssues: 5, availableSlots: 5 });
    assert.equal(res.json.dueDates.upcomingCount, 0);
    assert.equal(res.json.fines.outstanding, 0);
  });

  test('counts only the signed-in member’s own overdue issue and fines it ₹2 per day after the due date', async () => {
    const { rows } = await query(
      `SELECT c.id AS copy_id, c.book_id FROM book_copies c WHERE c.status = 'AVAILABLE' ORDER BY c.id LIMIT 1`
    );
    const { copy_id, book_id } = rows[0];
    let issueId;
    try {
      await query(`UPDATE book_copies SET status = 'ISSUED' WHERE id = $1`, [copy_id]);
      const inserted = await query(
        `INSERT INTO issues (user_id, book_id, copy_id, due_date)
         VALUES ($1, $2, $3, (now() AT TIME ZONE 'Asia/Kolkata')::date - 3) RETURNING id`,
        [member.user.id, book_id, copy_id]
      );
      issueId = inserted.rows[0].id;

      const mine = await member.client.get('/api/dashboard/summary');
      assert.equal(mine.json.borrowing.currentlyBorrowed, 1);
      assert.equal(mine.json.borrowing.availableSlots, 4);
      assert.equal(mine.json.dueDates.overdueCount, 1);
      assert.equal(mine.json.fines.outstanding, 6); // 3 days overdue x ₹2

      const other = await signedInClient(srv.base);
      const theirs = await other.client.get('/api/dashboard/summary');
      assert.equal(theirs.json.borrowing.currentlyBorrowed, 0);
      assert.equal(theirs.json.fines.outstanding, 0);
    } finally {
      if (issueId) await query('DELETE FROM issues WHERE id = $1', [issueId]);
      await query(`UPDATE book_copies SET status = 'AVAILABLE' WHERE id = $1`, [copy_id]);
    }
  });
});
