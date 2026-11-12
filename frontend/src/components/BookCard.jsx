import BookCover from './BookCover.jsx';

export function AvailabilityBadge({ availableCopies, totalCopies, compact = false }) {
  const available = availableCopies > 0;
  return (
    <span className={`badge ${available ? 'badge-good' : 'badge-warn'}`}>
      {available ? (compact ? `${availableCopies} available` : `${availableCopies} of ${totalCopies} available`) : 'All copies out'}
    </span>
  );
}

/** A clickable book tile. Opening it shows the quick view. */
export default function BookCard({ book, onOpen }) {
  return (
    <button type="button" className="book-card" onClick={() => onOpen(book)} aria-label={`Quick view: ${book.title} by ${book.author}`}>
      <BookCover book={book} />
      <div className="book-card-body">
        <h3 title={book.title}>{book.title}</h3>
        <p className="book-author">{book.author}</p>
        <div className="book-card-meta">
          <span className="book-genre">{book.genre}</span>
          <AvailabilityBadge availableCopies={book.availableCopies} totalCopies={book.totalCopies} compact />
        </div>
      </div>
    </button>
  );
}

export function BookGridSkeleton({ count = 8 }) {
  return (
    <div className="book-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="book-card skeleton" key={i}>
          <div className="cover skeleton-block" />
          <div className="book-card-body">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
