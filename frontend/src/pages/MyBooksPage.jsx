import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { formatDate, formatRupees } from '../lib/format.js';
import BookCover from '../components/BookCover.jsx';
import { Banner } from '../components/ui.jsx';

const STATUS = {
  ON_LOAN: { label: 'On loan', className: 'badge-info' },
  DUE_SOON: { label: 'Due soon', className: 'badge-warn' },
  OVERDUE: { label: 'Overdue', className: 'badge-bad' },
};

function dueText(item) {
  if (item.status === 'OVERDUE') return `Overdue by ${item.overdueDays} ${item.overdueDays === 1 ? 'day' : 'days'}`;
  if (item.daysUntilDue === 0) return 'Due today';
  if (item.daysUntilDue === 1) return 'Due tomorrow';
  return `Due in ${item.daysUntilDue} days`;
}

const issuedOn = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function LoanCard({ item }) {
  const status = STATUS[item.status];
  return (
    <article className={`loan-card${item.status === 'OVERDUE' ? ' is-overdue' : ''}`}>
      <Link to={`/books/${item.book.id}`} aria-label={`Details for ${item.book.title}`}>
        <BookCover book={item.book} className="cover-sm" />
      </Link>
      <div className="loan-body">
        <div className="loan-top">
          <span className={`badge ${status.className}`}>{status.label}</span>
          <span className="loan-due">{dueText(item)}</span>
        </div>
        <h3>
          <Link to={`/books/${item.book.id}`}>{item.book.title}</Link>
        </h3>
        <p className="muted">by {item.book.author}</p>

        <dl className="loan-facts">
          <div>
            <dt>Copy ID</dt>
            <dd>{item.copyCode}</dd>
          </div>
          <div>
            <dt>Issued</dt>
            <dd>{issuedOn(item.issuedAt)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{formatDate(item.dueDate)}</dd>
          </div>
          <div>
            <dt>Renewal</dt>
            <dd>{item.renewal.label}</dd>
          </div>
        </dl>

        {item.accruedFine > 0 && (
          <p className="loan-fine">
            Fine so far: <strong>{formatRupees(item.accruedFine)}</strong>
          </p>
        )}
      </div>
    </article>
  );
}

function HistoryRow({ item }) {
  return (
    <li>
      <BookCover book={{ id: item.book.id, ...item.book }} className="cover-xs" />
      <div>
        <Link to={`/books/${item.book.id}`}>{item.book.title}</Link>
        <p className="muted small">
          {item.book.author} · Copy {item.copyCode}
        </p>
      </div>
      <div className="due-when">
        <strong>{item.status === 'LOST' ? 'Lost' : 'Returned'}</strong>
        <span className="muted small">{issuedOn(item.closedAt)}</span>
      </div>
    </li>
  );
}

export default function MyBooksPage() {
  const { data, error, loading, reload } = useApi((signal) => api.myBooks(signal), []);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>My Books</h1>
        <p>The books you currently have on loan.</p>
      </div>

      {error && (
        <Banner>
          {error.message}{' '}
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        </Banner>
      )}

      {loading && !data && (
        <div className="loan-list" aria-hidden="true">
          {[0, 1].map((i) => (
            <div className="loan-card skeleton" key={i}>
              <div className="cover cover-sm skeleton-block" />
              <div className="loan-body">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
              </div>
            </div>
          ))}
        </div>
      )}

      {data && (
        <>
          <section>
            <h2 className="section-title">
              Currently borrowed{' '}
              <span className="muted small">
                {data.active.length} of {data.maxActiveIssues}
              </span>
            </h2>
            {data.active.length === 0 ? (
              <div className="empty-state">
                <h2>You have no books on loan</h2>
                <p className="muted">Find something to read and it will show up here once you issue it.</p>
                <Link to="/search" className="btn btn-primary btn-auto">
                  Search books
                </Link>
              </div>
            ) : (
              <div className="loan-list">
                {data.active.map((item) => (
                  <LoanCard key={item.issueId} item={item} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="section-title">Borrowing history</h2>
            {data.history.length === 0 ? (
              <div className="empty-state">
                <p className="muted">Books you have returned will be listed here.</p>
              </div>
            ) : (
              <ul className="due-list panel">
                {data.history.map((item) => (
                  <HistoryRow key={item.issueId} item={item} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
