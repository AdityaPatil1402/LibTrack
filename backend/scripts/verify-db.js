// Verifies the database after "npm run migrate" and "npm run seed".
// Prints PASS/FAIL per check and exits with code 1 if anything fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.js';
import { pool, closePool } from '../src/db/pool.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');

let failures = 0;
const report = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`);
};

const scalar = async (sql, params) => (await pool.query(sql, params)).rows[0].n;

// Runs a statement that MUST be rejected by the database, then rolls back.
async function expectRejected(label, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql, params);
    await client.query('ROLLBACK');
    report(false, label, 'statement was accepted');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    report(true, label, err.message.split('\n')[0]);
  } finally {
    client.release();
  }
}

try {
  console.log('--- Server ---');
  const info = (
    await pool.query(
      `SELECT version() AS version, current_database() AS db, current_setting('server_version') AS sv,
              inet_server_port() AS port`
    )
  ).rows[0];
  console.log(`Configured: ${env.db.host}:${env.db.port}  database=${env.db.database}  user=${env.db.user}`);
  console.log(`Server    : ${info.version}`);
  report(info.db === env.db.database, 'Connected to the configured database', info.db);

  console.log('\n--- Schema ---');
  const expectedTables = [
    'roles', 'users', 'auth_sessions', 'genres', 'authors', 'books', 'book_copies',
    'reservations', 'issues', 'reservation_holds', 'fines', 'fine_adjustments',
    'transaction_events', 'notifications', 'system_config', 'schema_migrations',
  ];
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const present = new Set(tables.map((t) => t.table_name));
  const missing = expectedTables.filter((t) => !present.has(t));
  report(missing.length === 0, `All ${expectedTables.length} expected tables exist`, missing.join(', '));
  // Every migration file in the project must be recorded as applied (a new phase adds files).
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f));
  const recorded = await scalar('SELECT count(*)::int AS n FROM schema_migrations');
  report(
    recorded === migrationFiles.length,
    `All ${migrationFiles.length} migrations recorded`,
    recorded === migrationFiles.length ? '' : `${recorded} recorded, ${migrationFiles.length} files: run "npm run migrate"`
  );

  console.log('\n--- Catalogue ---');
  report((await scalar('SELECT count(*)::int AS n FROM books')) === 30, 'Exactly 30 catalogue titles');
  report((await scalar('SELECT count(DISTINCT author_id)::int AS n FROM books')) >= 25, 'Varied authors',
    `${await scalar('SELECT count(DISTINCT author_id)::int AS n FROM books')} distinct`);
  report((await scalar('SELECT count(*)::int AS n FROM genres')) === 12, '12 genres');
  report((await scalar('SELECT count(*)::int AS n FROM books WHERE isbn_is_demo')) === 30, 'All ISBNs flagged as demo');
  report(
    (await scalar(`SELECT count(*)::int AS n FROM books b WHERE NOT EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id)`)) === 0,
    'Every title has at least one physical copy'
  );
  const copies = await scalar('SELECT count(*)::int AS n FROM book_copies');
  const distinctCodes = await scalar('SELECT count(DISTINCT copy_code)::int AS n FROM book_copies');
  report(copies > 30 && copies === distinctCodes, 'Physical copies have unique IDs', `${copies} copies`);
  const { rows: spread } = await pool.query(
    `SELECT min(c)::int AS lo, max(c)::int AS hi FROM (SELECT count(*) AS c FROM book_copies GROUP BY book_id) s`
  );
  report(spread[0].lo !== spread[0].hi, 'Copy quantities vary by title', `${spread[0].lo} to ${spread[0].hi} copies`);

  const { rows: statuses } = await pool.query(
    `SELECT status, count(*)::int AS n FROM book_copies GROUP BY status ORDER BY status`
  );
  console.log('      copy statuses: ' + statuses.map((s) => `${s.status}=${s.n}`).join(', '));
  const required = ['AVAILABLE', 'ISSUED', 'UNDER_INSPECTION', 'DAMAGED', 'LOST', 'WITHDRAWN'];
  const have = new Set(statuses.map((s) => s.status));
  report(required.every((s) => have.has(s)), 'All six required copy statuses are represented');

  const { rows: sample } = await pool.query(
    `SELECT copy_code FROM book_copies WHERE copy_code = 'ATOM001'`
  );
  report(sample.length === 1, 'Example copy ID ATOM001 exists');

  console.log('\n--- Consistency ---');
  report(
    (await scalar(
      `SELECT count(*)::int AS n FROM book_copies c
        WHERE (c.status = 'ISSUED') <> EXISTS (SELECT 1 FROM issues i WHERE i.copy_id = c.id AND i.status = 'ACTIVE')`
    )) === 0,
    'Copy status ISSUED matches an active issue (both directions)'
  );
  report(
    (await scalar(
      `SELECT count(*)::int AS n FROM (SELECT user_id FROM issues WHERE status = 'ACTIVE' GROUP BY user_id HAVING count(*) > 5) s`
    )) === 0,
    'No user exceeds 5 active issues'
  );
  report(
    (await scalar(`SELECT count(*)::int AS n FROM issues WHERE status = 'ACTIVE' AND due_date < (now() AT TIME ZONE 'UTC')::date`)) === 0,
    'No seeded issue is overdue at seed time'
  );
  const { rows: noStock } = await pool.query(
    `SELECT count(*)::int AS n FROM books b
      WHERE NOT EXISTS (SELECT 1 FROM book_copies c WHERE c.book_id = b.id AND c.status = 'AVAILABLE')`
  );
  console.log(`      titles with no AVAILABLE copy (reservable): ${noStock[0].n}`);
  report(30 - noStock[0].n >= 20, 'At least 20 titles are eligible for recommendations', `${30 - noStock[0].n} eligible`);

  const { rows: cfg } = await pool.query(`SELECT value FROM system_config WHERE key = 'library_timezone'`);
  const tz = cfg[0]?.value;
  let tzValid = false;
  try {
    tzValid = typeof tz === 'string' && Boolean(new Intl.DateTimeFormat('en', { timeZone: tz }));
  } catch {
    /* not a valid IANA timezone name */
  }
  report(tzValid, 'library_timezone is a valid IANA timezone', String(tz));

  console.log('\n--- Database-level rules (each must be rejected) ---');
  await expectRejected(
    'Updating a transaction event is blocked',
    `UPDATE transaction_events SET reason = 'tamper' WHERE id = (SELECT min(id) FROM transaction_events)`
  );
  await expectRejected(
    'Deleting a transaction event is blocked',
    `DELETE FROM transaction_events WHERE id = (SELECT min(id) FROM transaction_events)`
  );
  await expectRejected('Truncating transaction events is blocked', 'TRUNCATE transaction_events');
  await expectRejected(
    'Changing a username is blocked',
    `UPDATE users SET username = 'renamed_user' WHERE username = 'seed_borrower_1'`
  );
  await expectRejected(
    'A second active issue on the same copy is blocked',
    `INSERT INTO issues (user_id, book_id, copy_id, due_date)
     SELECT u.id, i.book_id, i.copy_id, current_date + 14
       FROM issues i, users u WHERE i.status = 'ACTIVE' AND u.username = 'seed_borrower_8' LIMIT 1`
  );
  await expectRejected(
    'An issue whose book does not match its copy is blocked',
    `INSERT INTO issues (user_id, book_id, copy_id, due_date)
     SELECT (SELECT id FROM users WHERE username = 'seed_borrower_1'),
            (SELECT id FROM books WHERE copy_code_prefix = 'ATOM'),
            (SELECT id FROM book_copies WHERE copy_code = 'SAPI001'),
            current_date + 14`
  );
  await expectRejected(
    'Duplicate notification dedupe key is blocked',
    `WITH u AS (SELECT id FROM users WHERE username = 'seed_borrower_1'),
          a AS (INSERT INTO notifications (user_id, type, title, message, dedupe_key)
                SELECT id, 'ISSUE_SUCCESS', 't', 'm', 'dup-key' FROM u RETURNING id)
     INSERT INTO notifications (user_id, type, title, message, dedupe_key)
     SELECT id, 'ISSUE_SUCCESS', 't', 'm', 'dup-key' FROM u`
  );
} catch (err) {
  failures += 1;
  console.error(`\nVerification error: ${err.message}`);
} finally {
  await closePool();
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
process.exitCode = failures === 0 ? 0 : 1;
