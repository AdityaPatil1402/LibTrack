import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import BookCard, { BookGridSkeleton } from '../components/BookCard.jsx';
import QuickViewModal from '../components/QuickViewModal.jsx';
import { Icon } from '../components/icons.jsx';
import { Banner } from '../components/ui.jsx';

const PAGE_SIZE = 12;
const SORTS = [
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'author', label: 'Author (A–Z)' },
  { value: 'recent', label: 'Recently added' },
];

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const genreId = params.get('genreId') || '';
  const authorId = params.get('authorId') || '';
  const sort = SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : 'title';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);

  // The text box updates instantly; the URL (and so the request) follows after a short pause.
  const [text, setText] = useState(q);
  const debounced = useDebouncedValue(text, 300);
  const [quickView, setQuickView] = useState(null);

  // Only an outside change to the query (e.g. the top-bar search) should replace the text box;
  // a query this page pushed itself must not overwrite what the member typed since.
  const pushedQuery = useRef(q);
  useEffect(() => {
    if (q !== pushedQuery.current) {
      pushedQuery.current = q;
      setText(q);
    }
  }, [q]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value === undefined || value === null) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (debounced.trim() !== q.trim()) {
      pushedQuery.current = debounced.trim();
      update({ q: debounced.trim() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const filters = useApi((signal) => api.filterOptions(signal), []);
  const results = useApi(
    (signal) => api.searchBooks({ q, genreId, authorId, sort, page, pageSize: PAGE_SIZE }, signal),
    [q, genreId, authorId, sort, page]
  );

  const data = results.data;
  const hasFilters = Boolean(q || genreId || authorId);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Search Books</h1>
        <p>Titles with a copy available to borrow right now.</p>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <Icon.Search width={17} height={17} />
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Title or ISBN"
            aria-label="Search by title or ISBN"
            maxLength={100}
          />
        </div>
        <select value={genreId} onChange={(event) => update({ genreId: event.target.value })} aria-label="Filter by genre">
          <option value="">All genres</option>
          {filters.data?.genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name} ({g.titleCount})
            </option>
          ))}
        </select>
        <select value={authorId} onChange={(event) => update({ authorId: event.target.value })} aria-label="Filter by author">
          <option value="">All authors</option>
          {filters.data?.authors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(event) => update({ sort: event.target.value })} aria-label="Sort results">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {results.error && (
        <Banner>
          {results.error.message}{' '}
          <button type="button" className="link-btn" onClick={results.reload}>
            Try again
          </button>
        </Banner>
      )}

      {results.loading && !data && <BookGridSkeleton count={PAGE_SIZE} />}

      {data && (
        <>
          <p className="muted small" aria-live="polite">
            {data.total === 0 ? 'No books found' : `${data.total} book${data.total === 1 ? '' : 's'} found`}
            {results.loading ? ' · updating…' : ''}
          </p>

          {data.items.length === 0 ? (
            <section className="empty-state">
              <h2>{hasFilters ? 'No matching books' : 'No books are available right now'}</h2>
              <p className="muted">
                {hasFilters
                  ? 'Try a different title, ISBN, genre or author. Titles whose copies are all out are not listed here, but you can still find them on your dashboard.'
                  : 'Check back soon, or look through the recommendations on your dashboard.'}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  className="btn btn-ghost btn-auto"
                  onClick={() => {
                    setText('');
                    setParams({}, { replace: true });
                  }}
                >
                  Clear search and filters
                </button>
              )}
            </section>
          ) : (
            <div className={`book-grid${results.loading ? ' is-loading' : ''}`}>
              {data.items.map((book) => (
                <BookCard key={book.id} book={book} onOpen={setQuickView} />
              ))}
            </div>
          )}

          {data.totalPages > 1 && (
            <nav className="pager" aria-label="Pagination">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>
                Previous
              </button>
              <span className="muted small">
                Page {Math.min(page, data.totalPages)} of {data.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={page >= data.totalPages}
                onClick={() => update({ page: page + 1 })}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {quickView && <QuickViewModal book={quickView} onClose={() => setQuickView(null)} />}
    </div>
  );
}
