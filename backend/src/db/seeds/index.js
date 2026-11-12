import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool, withTransaction } from '../pool.js';
import { BOOKS, GENRES, STATUS_CODES, COPY_NOTES } from './data/catalogue.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const SEED_BORROWER_COUNT = 8;

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- Reference data: roles and system configuration -------------------------------------------
const CONFIG = [
  ['max_active_issues', 5, 'Maximum active issued books per user.'],
  ['loan_period_days', 14, 'Initial borrowing period in calendar days.'],
  ['max_renewals_per_issue', 1, 'Renewals allowed per issue.'],
  ['renewal_period_days', 14, 'Calendar days added to the existing due date on renewal.'],
  ['fine_per_day_inr', 2, 'Overdue fine in rupees per calendar day. No cap.'],
  ['reservation_hold_hours', 48, 'Hours a reserved copy is held for the user.'],
  ['session_inactivity_minutes', 30, 'Inactivity timeout for login sessions.'],
  ['due_reminder_days_before', [3, 1], 'Calendar days before the due date on which reminders are sent.'],
  [
    'library_timezone',
    null,
    'UNSET. The library timezone must be confirmed by the owner before calendar-based due dates are implemented.',
  ],
];

async function seedReferenceData(client) {
  await client.query(
    `INSERT INTO roles (name, description) VALUES
       ('USER', 'Library member'),
       ('ADMIN', 'Library administrator')
     ON CONFLICT (name) DO NOTHING`
  );

  let configInserted = 0;
  for (const [key, value, description] of CONFIG) {
    // DO NOTHING: re-running the seed must never overwrite a value someone has changed.
    const { rowCount } = await client.query(
      `INSERT INTO system_config (key, value, description) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value), description]
    );
    configInserted += rowCount;
  }
  return { configInserted };
}

// --- Catalogue: genres, authors, books, physical copies ----------------------------------------
async function seedCatalogue(client) {
  const genreIds = new Map();
  for (const name of GENRES) {
    const { rows } = await client.query(
      `INSERT INTO genres (name, slug) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET slug = EXCLUDED.slug
       RETURNING id`,
      [name, slugify(name)]
    );
    genreIds.set(name, rows[0].id);
  }

  const authorIds = new Map();
  for (const name of new Set(BOOKS.map((b) => b.author))) {
    const { rows } = await client.query(
      `INSERT INTO authors (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name]
    );
    authorIds.set(name, rows[0].id);
  }

  let booksInserted = 0;
  let copiesInserted = 0;

  for (const [index, book] of BOOKS.entries()) {
    const isbn = `DEMO-ISBN-${String(index + 1).padStart(4, '0')}`;
    // Stagger created_at so "recently added" is meaningful. Only set on first insert.
    const createdDaysAgo = (index * 7) % 90;

    const { rows } = await client.query(
      `INSERT INTO books (title, author_id, genre_id, isbn, isbn_is_demo, description,
                          publication_year, page_count, language, copy_code_prefix, is_curated, created_at)
       VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, 'English', $8, $9, now() - make_interval(days => $10::int))
       ON CONFLICT (isbn) DO UPDATE SET
         title = EXCLUDED.title,
         author_id = EXCLUDED.author_id,
         genre_id = EXCLUDED.genre_id,
         description = EXCLUDED.description,
         publication_year = EXCLUDED.publication_year,
         page_count = EXCLUDED.page_count,
         copy_code_prefix = EXCLUDED.copy_code_prefix,
         is_curated = EXCLUDED.is_curated
       RETURNING id, (xmax = 0) AS inserted`,
      [
        book.title,
        authorIds.get(book.author),
        genreIds.get(book.genre),
        isbn,
        book.description,
        book.year,
        book.pages,
        book.prefix,
        book.curated,
        createdDaysAgo,
      ]
    );
    const bookId = rows[0].id;
    if (rows[0].inserted) booksInserted += 1;

    for (const [copyIndex, letter] of [...book.copies].entries()) {
      const status = STATUS_CODES[letter];
      const copyCode = `${book.prefix}${String(copyIndex + 1).padStart(3, '0')}`;
      // DO NOTHING: re-running the seed must never reset a copy's live status.
      const result = await client.query(
        `INSERT INTO book_copies (book_id, copy_code, status, condition_notes, acquired_on)
         VALUES ($1, $2, $3, $4, current_date - ($5::int))
         ON CONFLICT (copy_code) DO NOTHING`,
        [bookId, copyCode, status, COPY_NOTES[letter] ?? null, 30 + ((index * 13 + copyIndex * 29) % 700)]
      );
      copiesInserted += result.rowCount;
    }
  }

  return { booksInserted, copiesInserted };
}

// --- Demo circulation: active issues for seeded ISSUED copies ---------------------------------
// Every ISSUED copy must have exactly one active issue. These are held by inactive seed
// borrower accounts that cannot log in (their password hash is not a valid hash).
async function seedDemoCirculation(client) {
  await client.query(
    `INSERT INTO users (full_name, username, email, password_hash, role_id, is_active)
     SELECT 'Seed Borrower ' || n, 'seed_borrower_' || n, 'seed_borrower_' || n || '@libtrack.invalid',
            '!DISABLED-SEED-ACCOUNT', (SELECT id FROM roles WHERE name = 'USER'), FALSE
     FROM generate_series(1, $1::int) AS n
     ON CONFLICT ((lower(username))) DO NOTHING`,
    [SEED_BORROWER_COUNT]
  );

  const { rows: borrowers } = await client.query(
    `SELECT id FROM users WHERE username LIKE 'seed\\_borrower\\_%' ORDER BY username`
  );

  const { rows: orphanCopies } = await client.query(
    `SELECT c.id AS copy_id, c.book_id
       FROM book_copies c
       LEFT JOIN issues i ON i.copy_id = c.id AND i.status = 'ACTIVE'
      WHERE c.status = 'ISSUED' AND i.id IS NULL
      ORDER BY c.id`
  );

  let issuesInserted = 0;
  for (const [index, copy] of orphanCopies.entries()) {
    const borrower = borrowers[index % borrowers.length];
    // Issued 2..13 days ago, so every seeded issue is due 1..12 days from now (none overdue).
    const daysAgo = 2 + ((index * 5) % 12);

    const { rows } = await client.query(
      `INSERT INTO issues (user_id, book_id, copy_id, issued_at, due_date)
       VALUES ($1, $2, $3, now() - make_interval(days => $4::int),
               (now() AT TIME ZONE 'UTC')::date - $4::int + 14)
       RETURNING id, due_date`,
      [borrower.id, copy.book_id, copy.copy_id, daysAgo]
    );

    await client.query(
      `INSERT INTO transaction_events
         (event_type, user_id, book_id, copy_id, issue_id, previous_state, new_state, reason)
       VALUES ('BOOK_ISSUED', $1, $2, $3, $4, $5::jsonb, $6::jsonb, 'Seeded demo data')`,
      [
        borrower.id,
        copy.book_id,
        copy.copy_id,
        rows[0].id,
        JSON.stringify({ copy_status: 'AVAILABLE' }),
        JSON.stringify({ copy_status: 'ISSUED', issue_status: 'ACTIVE', due_date: rows[0].due_date }),
      ]
    );
    issuesInserted += 1;
  }

  return { borrowers: borrowers.length, issuesInserted };
}

export async function runSeed() {
  return withTransaction(async (client) => {
    const reference = await seedReferenceData(client);
    const catalogue = await seedCatalogue(client);
    const circulation = await seedDemoCirculation(client);
    return { ...reference, ...catalogue, ...circulation };
  });
}

async function main() {
  try {
    console.log('Seeding database...');
    const result = await runSeed();
    console.log('Newly inserted this run:');
    console.log(`  config keys     : ${result.configInserted}`);
    console.log(`  books           : ${result.booksInserted}`);
    console.log(`  physical copies : ${result.copiesInserted}`);
    console.log(`  seeded issues   : ${result.issuesInserted}`);

    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM books)::int AS books, (SELECT count(*) FROM book_copies)::int AS copies`
    );
    console.log(`Database now holds ${rows[0].books} titles and ${rows[0].copies} physical copies.`);
    console.log('Seed complete (safe to run again).');
  } catch (err) {
    console.error(`Seed error: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === THIS_FILE) {
  main();
}
