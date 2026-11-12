// Test helpers: start the real app on a random port and talk to it over HTTP with a cookie jar,
// the way a browser would.
process.env.BCRYPT_COST = process.env.BCRYPT_COST || '4'; // fast hashing for tests only
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';

const { createApp } = await import('../src/app.js');
const { pool, query } = await import('../src/db/pool.js');

export { pool, query };
export const TEST_PREFIX = 'zz_test_';

export async function startServer(options) {
  const app = createApp(options);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** A minimal browser: remembers cookies and sends the CSRF header automatically. */
export class Client {
  constructor(base) {
    this.base = base;
    this.cookies = new Map();
  }

  cookie(name) {
    return this.cookies.get(name);
  }

  #store(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => /^\s*expires=thu, 01 jan 1970/i.test(a)) || value === '';
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async raw(method, path, { body, headers = {}, csrf = true } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    const jar = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (jar) h.cookie = jar;
    if (csrf && this.cookies.has('lt_csrf')) h['x-csrf-token'] = this.cookies.get('lt_csrf');

    const res = await fetch(this.base + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    this.#store(res);
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  /** Fetches a CSRF token first (as the frontend does on load), then sends the request. */
  async request(method, path, opts) {
    if (!this.cookies.has('lt_csrf')) await this.raw('GET', '/api/auth/csrf');
    return this.raw(method, path, opts);
  }

  get = (path, opts) => this.request('GET', path, opts);
  post = (path, body, opts) => this.request('POST', path, { ...opts, body });
  patch = (path, body, opts) => this.request('PATCH', path, { ...opts, body });
}

let counter = 0;
export function newUserData(overrides = {}) {
  counter += 1;
  const n = `${Date.now().toString(36)}${counter}`;
  return {
    fullName: 'Test Reader',
    username: `${TEST_PREFIX}${n}`,
    email: `${TEST_PREFIX}${n}@example.com`,
    phone: '+919876543210',
    password: 'Secret123',
    confirmPassword: 'Secret123',
    ...overrides,
  };
}

/** Signs up and logs in; returns { client, data, user }. */
export async function signedInClient(base, overrides) {
  const client = new Client(base);
  const data = newUserData(overrides);
  const signup = await client.post('/api/auth/signup', data);
  if (signup.status !== 201) throw new Error(`signup failed: ${signup.status} ${signup.text}`);
  const login = await client.post('/api/auth/login', { identifier: data.username, password: data.password });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${login.text}`);
  return { client, data, user: login.json.user };
}

const TEST_BOOK_PREFIX = 'ZZT';
const STATUS = { A: 'AVAILABLE', I: 'ISSUED', U: 'UNDER_INSPECTION', D: 'DAMAGED', L: 'LOST', W: 'WITHDRAWN' };

/**
 * Removes everything the tests created: test members (zz_test_*) with their issues, notifications
 * and sessions, plus the throw-away test books (copy prefix ZZT*) and their copies.
 *
 * transaction_events is immutable, so its "no update/delete" trigger is switched off for the
 * length of this one transaction, ONLY to remove events that belong to the throw-away test
 * accounts and test books. It is switched back on before the transaction commits (and any failure
 * rolls the whole thing back, trigger included). Real members' events are never touched.
 */
export async function cleanupTestUsers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const users = `SELECT id FROM users WHERE username LIKE '${TEST_PREFIX}%'`;
    const books = `SELECT id FROM books WHERE copy_code_prefix LIKE '${TEST_BOOK_PREFIX}%'`;

    await client.query('ALTER TABLE transaction_events DISABLE TRIGGER transaction_events_no_update_delete');
    await client.query(
      `DELETE FROM transaction_events
        WHERE user_id IN (${users}) OR actor_user_id IN (${users}) OR book_id IN (${books})`
    );
    await client.query('ALTER TABLE transaction_events ENABLE TRIGGER transaction_events_no_update_delete');

    await client.query(`DELETE FROM notifications WHERE user_id IN (${users})`);
    await client.query(`DELETE FROM fines WHERE user_id IN (${users})`);
    await client.query(`DELETE FROM issues WHERE user_id IN (${users}) OR book_id IN (${books})`);
    await client.query(`DELETE FROM auth_sessions WHERE user_id IN (${users})`);
    await client.query(`DELETE FROM users WHERE username LIKE '${TEST_PREFIX}%'`);
    await client.query(`DELETE FROM book_copies WHERE book_id IN (${books})`);
    await client.query(`DELETE FROM books WHERE copy_code_prefix LIKE '${TEST_BOOK_PREFIX}%'`);
    await client.query(`DELETE FROM authors WHERE name = 'ZZ Test Author'`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let bookCounter = 0;
/**
 * Creates a throw-away title. `copies` is one letter per physical copy:
 * A available, I issued, U under inspection, D damaged, L lost, W withdrawn.
 */
export async function createTestBook({ copies = 'AAA', archived = false } = {}) {
  bookCounter += 1;
  const prefix = `${TEST_BOOK_PREFIX}${String(bookCounter).padStart(2, '0')}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
  const { rows: g } = await query('SELECT id FROM genres ORDER BY id LIMIT 1');
  const { rows: a } = await query(
    `INSERT INTO authors (name) VALUES ('ZZ Test Author') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`
  );
  const { rows: b } = await query(
    `INSERT INTO books (title, author_id, genre_id, isbn, isbn_is_demo, description, copy_code_prefix, is_archived, archived_at)
     VALUES ($1, $2, $3, $4, TRUE, 'Throw-away book created by the automated tests.', $5, $6, CASE WHEN $6 THEN now() END)
     RETURNING id, title`,
    [`ZZ Test Book ${prefix}`, a[0].id, g[0].id, `ZZTEST-${prefix}`, prefix, archived]
  );
  const copyRows = [];
  for (const [index, letter] of [...copies].entries()) {
    const { rows } = await query(
      `INSERT INTO book_copies (book_id, copy_code, status) VALUES ($1, $2, $3) RETURNING id, copy_code`,
      [b[0].id, `${prefix}${String(index + 1).padStart(3, '0')}`, STATUS[letter]]
    );
    copyRows.push(rows[0]);
  }
  return { id: b[0].id, title: b[0].title, copies: copyRows };
}

/** Creates an ACTIVE issue straight in the database (for setting up a scenario). */
export async function giveIssue(userId, book, copy, { dueInDays = 14 } = {}) {
  await query(`UPDATE book_copies SET status = 'ISSUED' WHERE id = $1`, [copy.id]);
  const { rows } = await query(
    `INSERT INTO issues (user_id, book_id, copy_id, due_date)
     VALUES ($1, $2, $3, (now() AT TIME ZONE 'Asia/Kolkata')::date + $4::int) RETURNING id`,
    [userId, book.id, copy.id, dueInDays]
  );
  return rows[0].id;
}
