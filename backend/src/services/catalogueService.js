import { query } from '../db/pool.js';

const BOOK_FIELDS = `
  b.id, b.title, a.id AS author_id, a.name AS author, g.id AS genre_id, g.name AS genre,
  b.isbn, b.cover_url, b.publication_year, b.is_archived`;

const COPY_COUNTS = `
  count(c.id) FILTER (WHERE c.status = 'AVAILABLE') AS available_copies,
  count(c.id) AS total_copies`;

const toCard = (row) => ({
  id: row.id,
  title: row.title,
  author: row.author,
  genre: row.genre,
  isbn: row.isbn,
  coverUrl: row.cover_url,
  availableCopies: row.available_copies,
  totalCopies: row.total_copies,
  isAvailable: row.available_copies > 0,
});

// Only these sort orders exist; the SQL text is never built from user input.
const SORTS = {
  title: 'lower(b.title), b.id',
  author: 'lower(a.name), lower(b.title), b.id',
  recent: 'b.created_at DESC, b.id DESC',
};

const escapeLike = (value) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Normal catalogue search: non-archived titles that have at least one AVAILABLE physical copy.
 * Unavailable titles stay reachable through recommendations and book-detail links.
 */
export async function searchBooks({ q, authorId, genreId, sort, page, pageSize }) {
  const params = [];
  const where = ['NOT b.is_archived'];

  if (q) {
    params.push(`%${escapeLike(q)}%`);
    where.push(`(b.title ILIKE $${params.length} OR b.isbn ILIKE $${params.length})`);
  }
  if (authorId) {
    params.push(authorId);
    where.push(`b.author_id = $${params.length}`);
  }
  if (genreId) {
    params.push(genreId);
    where.push(`b.genre_id = $${params.length}`);
  }
  params.push(pageSize, (page - 1) * pageSize);

  const { rows } = await query(
    `SELECT ${BOOK_FIELDS}, ${COPY_COUNTS}, count(*) OVER () AS total_count
       FROM books b
       JOIN authors a ON a.id = b.author_id
       JOIN genres g ON g.id = b.genre_id
       LEFT JOIN book_copies c ON c.book_id = b.id
      WHERE ${where.join(' AND ')}
      GROUP BY b.id, a.id, g.id
     HAVING count(c.id) FILTER (WHERE c.status = 'AVAILABLE') > 0
      ORDER BY ${SORTS[sort]}
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  // total_count is repeated on every row; an empty last page has no rows to read it from.
  let total = rows[0]?.total_count ?? 0;
  if (rows.length === 0 && page > 1) {
    const { rows: countRows } = await query(
      `SELECT count(*) AS total FROM (
         SELECT b.id FROM books b
           JOIN book_copies c ON c.book_id = b.id AND c.status = 'AVAILABLE'
          WHERE ${where.join(' AND ')}
          GROUP BY b.id) t`,
      params.slice(0, -2)
    );
    total = countRows[0].total;
  }

  return {
    items: rows.map(toCard),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Authors and genres that currently have something to find in normal search. */
export async function getFilterOptions() {
  const [genres, authors] = await Promise.all([
    query(
      `SELECT g.id, g.name, count(DISTINCT b.id) AS title_count
         FROM genres g
         JOIN books b ON b.genre_id = g.id AND NOT b.is_archived
         JOIN book_copies c ON c.book_id = b.id AND c.status = 'AVAILABLE'
        GROUP BY g.id ORDER BY g.name`
    ),
    query(
      `SELECT a.id, a.name, count(DISTINCT b.id) AS title_count
         FROM authors a
         JOIN books b ON b.author_id = a.id AND NOT b.is_archived
         JOIN book_copies c ON c.book_id = b.id AND c.status = 'AVAILABLE'
        GROUP BY a.id ORDER BY a.name`
    ),
  ]);
  return {
    genres: genres.rows.map((r) => ({ id: r.id, name: r.name, titleCount: r.title_count })),
    authors: authors.rows.map((r) => ({ id: r.id, name: r.name, titleCount: r.title_count })),
  };
}

/** Full details for one title, including physical-copy availability by status. */
export async function getBookDetails(bookId) {
  const { rows } = await query(
    `SELECT ${BOOK_FIELDS}, b.description, b.publisher, b.edition, b.language, b.page_count,
            b.created_at, b.archived_at
       FROM books b
       JOIN authors a ON a.id = b.author_id
       JOIN genres g ON g.id = b.genre_id
      WHERE b.id = $1`,
    [bookId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  const { rows: statusRows } = await query(
    `SELECT status, count(*) AS n FROM book_copies WHERE book_id = $1 GROUP BY status`,
    [bookId]
  );
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));
  const totalCopies = statusRows.reduce((sum, r) => sum + r.n, 0);
  const availableCopies = byStatus.AVAILABLE ?? 0;

  // Reservation queue size, so the details page can say how many people are already waiting.
  const { rows: waitRows } = await query(
    `SELECT count(*) AS n FROM reservations WHERE book_id = $1 AND status = 'WAITING'`,
    [bookId]
  );

  return {
    id: row.id,
    title: row.title,
    author: row.author,
    authorId: row.author_id,
    genre: row.genre,
    genreId: row.genre_id,
    isbn: row.isbn,
    description: row.description,
    publisher: row.publisher,
    publicationYear: row.publication_year,
    language: row.language,
    edition: row.edition,
    pageCount: row.page_count,
    coverUrl: row.cover_url,
    isArchived: row.is_archived,
    availability: {
      availableCopies,
      totalCopies,
      isAvailable: availableCopies > 0 && !row.is_archived,
      byStatus,
      waitingReservations: waitRows[0].n,
    },
  };
}

// How many titles go into each recommendation section (they add up to 20 and never overlap).
const SECTION_QUOTAS = [
  { key: 'featured', label: 'Featured', size: 6 },
  { key: 'popular', label: 'Popular right now', size: 5 },
  { key: 'recent', label: 'Recently added', size: 5 },
];
const RECOMMENDATION_COUNT = 20;

/**
 * Exactly 20 recommendations when at least 20 eligible titles exist (otherwise every eligible
 * title), with no duplicates. Eligible = not archived. Built from real catalogue data:
 * curated flag, number of issues ever made, and date added.
 */
export async function getRecommendations() {
  const { rows } = await query(
    `SELECT ${BOOK_FIELDS}, ${COPY_COUNTS}, b.is_curated, b.created_at,
            (SELECT count(*) FROM issues i WHERE i.book_id = b.id) AS issue_count
       FROM books b
       JOIN authors a ON a.id = b.author_id
       JOIN genres g ON g.id = b.genre_id
       LEFT JOIN book_copies c ON c.book_id = b.id
      WHERE NOT b.is_archived
      GROUP BY b.id, a.id, g.id`
  );

  const byTitle = (x, y) => x.title.localeCompare(y.title) || x.id - y.id;
  const curated = rows.filter((r) => r.is_curated).sort(byTitle);
  const popular = [...rows].sort((x, y) => y.issue_count - x.issue_count || byTitle(x, y));
  const recent = [...rows].sort((x, y) => y.created_at - x.created_at || byTitle(x, y));

  const used = new Set();
  const sections = [];
  const take = (pool, size) => {
    const picked = [];
    for (const row of pool) {
      if (picked.length === size) break;
      if (used.has(row.id)) continue;
      used.add(row.id);
      picked.push(toCard(row));
    }
    return picked;
  };

  const pools = { featured: curated, popular, recent };
  for (const { key, label, size } of SECTION_QUOTAS) {
    sections.push({ key, label, items: take(pools[key], size) });
  }

  // Fill any shortfall (small catalogues, or a section that ran out) with other curated titles,
  // then the rest alphabetically, until we reach 20 or run out of eligible titles.
  const missing = Math.min(RECOMMENDATION_COUNT, rows.length) - used.size;
  const more = missing > 0 ? take([...curated, ...[...rows].sort(byTitle)], missing) : [];
  sections.push({ key: 'more', label: 'More to explore', items: more });

  const visible = sections.filter((s) => s.items.length > 0);
  return { total: used.size, sections: visible };
}
