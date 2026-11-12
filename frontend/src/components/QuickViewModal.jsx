import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks/useApi.js';
import BookCover from './BookCover.jsx';
import { AvailabilityBadge } from './BookCard.jsx';
import { Icon } from './icons.jsx';
import { Banner } from './ui.jsx';

/** Quick view of one title. The details are loaded from the API when the modal opens. */
export default function QuickViewModal({ book, onClose }) {
  const navigate = useNavigate();
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const { data, error, loading, reload } = useApi((signal) => api.book(book.id, signal), [book.id]);
  const full = data?.book;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, []);

  const availability = full?.availability;
  const canIssue = Boolean(availability?.isAvailable);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-view-title">
        <button type="button" className="icon-btn modal-close" onClick={onClose} ref={closeRef} aria-label="Close quick view">
          <Icon.Close />
        </button>

        <BookCover book={book} className="modal-cover" />

        <div className="modal-body">
          <p className="eyebrow">{book.genre}</p>
          <h2 id="quick-view-title">{book.title}</h2>
          <p className="modal-author">by {book.author}</p>

          <dl className="modal-facts">
            <div>
              <dt>ISBN</dt>
              <dd>{book.isbn}</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>
                <AvailabilityBadge
                  availableCopies={availability?.availableCopies ?? book.availableCopies}
                  totalCopies={availability?.totalCopies ?? book.totalCopies}
                />
              </dd>
            </div>
          </dl>

          {loading && !full && <div className="skeleton-line" style={{ height: 70 }} aria-label="Loading description" />}
          {error && (
            <Banner>
              {error.message}{' '}
              <button type="button" className="link-btn" onClick={reload}>
                Try again
              </button>
            </Banner>
          )}
          {full && <p className="modal-description">{full.description}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-primary btn-auto"
              disabled={!canIssue}
              onClick={() => navigate(`/issue/${book.id}`)}
              title={!canIssue && full ? 'No copy is available to issue right now.' : undefined}
            >
              ISSUE
            </button>
            <button type="button" className="btn btn-ghost btn-auto" onClick={() => navigate(`/books/${book.id}`)}>
              VIEW DETAILS
            </button>
          </div>
          {full && !canIssue && <p className="muted small">No copy is available right now. Open the full details to see the status.</p>}
        </div>
      </div>
    </div>
  );
}
