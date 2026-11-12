import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import BookCover from '../components/BookCover.jsx';
import { AvailabilityBadge } from '../components/BookCard.jsx';
import { Icon } from '../components/icons.jsx';
import { Banner, FullScreenSpinner } from '../components/ui.jsx';

const STATUS_LABELS = {
  AVAILABLE: 'Available',
  ISSUED: 'On loan',
  ON_HOLD: 'Held for a reservation',
  UNDER_INSPECTION: 'Being inspected',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
  WITHDRAWN: 'Withdrawn',
};

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : value);

export default function BookDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi((signal) => api.book(id, signal), [id]);

  if (loading && !data) return <FullScreenSpinner />;
  if (error) {
    return (
      <div className="stack-lg">
        <Link to="/search" className="back-link">
          <Icon.ArrowLeft width={16} height={16} /> Back to search
        </Link>
        <Banner>
          {error.status === 404 || error.status === 400 ? 'That book could not be found.' : error.message}{' '}
          {error.status !== 404 && error.status !== 400 && (
            <button type="button" className="link-btn" onClick={reload}>
              Try again
            </button>
          )}
        </Banner>
      </div>
    );
  }

  const book = data.book;
  const { availability } = book;

  return (
    <div className="stack-lg">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        <Icon.ArrowLeft width={16} height={16} /> Back
      </button>

      <div className="details">
        <BookCover book={book} className="details-cover" />

        <div className="details-main">
          <p className="eyebrow">{book.genre}</p>
          <h1>{book.title}</h1>
          <p className="details-author">by {book.author}</p>

          <div className="details-availability">
            <AvailabilityBadge availableCopies={availability.availableCopies} totalCopies={availability.totalCopies} />
            {availability.waitingReservations > 0 && (
              <span className="muted small">
                {availability.waitingReservations} {availability.waitingReservations === 1 ? 'person is' : 'people are'} waiting
              </span>
            )}
          </div>

          {book.isArchived && <Banner kind="warning">This title has been archived and cannot be issued or reserved.</Banner>}

          <p className="details-description">{book.description}</p>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary btn-auto"
              disabled={!availability.isAvailable}
              onClick={() => navigate(`/issue/${book.id}`)}
            >
              ISSUE
            </button>
          </div>
          {!availability.isAvailable && !book.isArchived && (
            <p className="muted small">
              Every copy is currently out or unavailable. Reservations open in a later phase of LibTrack, so there is nothing to
              reserve yet.
            </p>
          )}

          <dl className="spec-grid">
            <div><dt>ISBN</dt><dd>{book.isbn}</dd></div>
            <div><dt>Publisher</dt><dd>{dash(book.publisher)}</dd></div>
            <div><dt>Publication year</dt><dd>{dash(book.publicationYear)}</dd></div>
            <div><dt>Language</dt><dd>{dash(book.language)}</dd></div>
            <div><dt>Edition</dt><dd>{dash(book.edition)}</dd></div>
            <div><dt>Pages</dt><dd>{dash(book.pageCount)}</dd></div>
          </dl>

          <section className="panel">
            <h2 className="section-title">Physical copies</h2>
            {availability.totalCopies === 0 ? (
              <p className="muted">This title has no physical copies on record.</p>
            ) : (
              <ul className="copy-status-list">
                {Object.entries(availability.byStatus).map(([status, count]) => (
                  <li key={status}>
                    <span>{STATUS_LABELS[status] ?? status}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
