import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import { formatDate } from '../lib/format.js';
import BookCover from '../components/BookCover.jsx';
import { AvailabilityBadge } from '../components/BookCard.jsx';
import { Icon } from '../components/icons.jsx';
import { Banner, Button, FullScreenSpinner } from '../components/ui.jsx';

function NotFound({ error, reload }) {
  const missing = error.status === 404 || error.status === 400;
  return (
    <div className="stack-lg">
      <Link to="/search" className="back-link">
        <Icon.ArrowLeft width={16} height={16} /> Back to search
      </Link>
      <Banner>
        {missing ? 'That book could not be found.' : error.message}{' '}
        {!missing && (
          <button type="button" className="link-btn" onClick={reload}>
            Try again
          </button>
        )}
      </Banner>
    </div>
  );
}

function Confirmation({ result }) {
  const { issue, borrowing } = result;
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Book issued</h1>
        <p>Enjoy your reading.</p>
      </div>
      <Banner kind="success">
        “{issue.title}” has been issued to you. You now have {borrowing.activeCount} of {borrowing.maxActiveIssues} books on
        loan.
      </Banner>
      <section className="panel">
        <dl className="spec-grid no-border">
          <div>
            <dt>Book</dt>
            <dd>{issue.title}</dd>
          </div>
          <div>
            <dt>Physical copy</dt>
            <dd>{issue.copyCode}</dd>
          </div>
          <div>
            <dt>Issued on</dt>
            <dd>{new Date(issue.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>
              {formatDate(issue.dueDate)} ({issue.loanPeriodDays} days)
            </dd>
          </div>
        </dl>
      </section>
      <div className="modal-actions">
        <Link to="/my-books" className="btn btn-primary btn-auto">
          Go to My Books
        </Link>
        <Link to="/search" className="btn btn-ghost btn-auto">
          Keep browsing
        </Link>
      </div>
    </div>
  );
}

/** The dedicated Issue Book page. Nothing is issued until the member confirms, and the server re-checks every rule. */
export default function IssueBookPage() {
  const { id } = useParams();
  const book = useApi((signal) => api.book(id, signal), [id]);
  const rules = useApi((signal) => api.issueEligibility(id, signal), [id]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);
  const [result, setResult] = useState(null);

  if (result) return <Confirmation result={result} />;
  if ((book.loading && !book.data) || (rules.loading && !rules.data && !rules.error && !book.error)) return <FullScreenSpinner />;
  if (book.error) return <NotFound error={book.error} reload={book.reload} />;

  const details = book.data.book;
  const preview = rules.data;
  const blocker = failure ?? preview?.blocker ?? null;
  const canConfirm = Boolean(preview?.canIssue) && !failure;

  const confirm = async () => {
    setBusy(true);
    setFailure(null);
    try {
      setResult(await api.issueBook(details.id));
    } catch (err) {
      if (err.status === 401) return; // the app is already signing the member out
      setFailure({ code: err.code, message: err.message });
      rules.reload(); // show the up-to-date counts and availability
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <Link to={`/books/${details.id}`} className="back-link">
        <Icon.ArrowLeft width={16} height={16} /> Back to book details
      </Link>
      <div className="page-head">
        <h1>Issue Book</h1>
        <p>Review the details, then confirm to borrow this book.</p>
      </div>

      <section className="panel issue-panel">
        <BookCover book={details} className="cover-sm" />
        <div>
          <p className="eyebrow">{details.genre}</p>
          <h2>{details.title}</h2>
          <p className="muted">by {details.author}</p>
          <p className="muted small">ISBN {details.isbn}</p>
          <div className="details-availability">
            <AvailabilityBadge availableCopies={details.availability.availableCopies} totalCopies={details.availability.totalCopies} />
          </div>
          <p className="modal-description">{details.description}</p>
        </div>
      </section>

      {rules.error && (
        <Banner>
          Could not check your borrowing status. {rules.error.message}{' '}
          <button type="button" className="link-btn" onClick={rules.reload}>
            Try again
          </button>
        </Banner>
      )}

      {preview && (
        <section className="panel">
          <h2 className="section-title">Your loan</h2>
          <dl className="spec-grid no-border">
            <div>
              <dt>Loan period</dt>
              <dd>{preview.loanPeriodDays} days</dd>
            </div>
            <div>
              <dt>Due date if issued today</dt>
              <dd>{formatDate(preview.dueDateIfIssuedToday)}</dd>
            </div>
            <div>
              <dt>Books on loan now</dt>
              <dd>
                {preview.borrowing.activeCount} of {preview.borrowing.maxActiveIssues}
              </dd>
            </div>
            <div>
              <dt>Overdue fine</dt>
              <dd>₹2 per day after the due date</dd>
            </div>
          </dl>
        </section>
      )}

      {blocker && (
        <Banner kind={failure ? 'error' : 'warning'}>
          {blocker.message}
          {blocker.code === 'NO_COPY_AVAILABLE' && ' Reservations are not available yet, so please check back later.'}
          {blocker.code === 'OVERDUE_BLOCKED' && (
            <>
              {' '}
              <Link to="/my-books">See your books</Link>
            </>
          )}
          {blocker.code === 'LIMIT_REACHED' && (
            <>
              {' '}
              <Link to="/my-books">See your books</Link>
            </>
          )}
        </Banner>
      )}

      <div className="modal-actions">
        <Button type="button" className="btn btn-primary btn-auto" busy={busy} disabled={!canConfirm} onClick={confirm}>
          {busy ? 'Issuing…' : 'Confirm issue'}
        </Button>
        <Link to="/search" className="btn btn-ghost btn-auto">
          Cancel
        </Link>
      </div>
    </div>
  );
}
