import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { dueLabel, formatDate, formatRupees } from '../lib/format.js';
import BookCard, { BookGridSkeleton } from '../components/BookCard.jsx';
import QuickViewModal from '../components/QuickViewModal.jsx';
import BookCover from '../components/BookCover.jsx';
import { Icon } from '../components/icons.jsx';
import { Banner } from '../components/ui.jsx';

function SummaryCard({ icon: CardIcon, label, value, note, tone }) {
  return (
    <div className={`stat-card${tone ? ` tone-${tone}` : ''}`}>
      <span className="stat-icon">
        <CardIcon />
      </span>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className="stat-note">{note}</p>
    </div>
  );
}

function SummarySection({ summary }) {
  const { borrowing, dueDates, fines } = summary;
  const upcomingNote =
    dueDates.overdueCount > 0
      ? `${dueDates.overdueCount} overdue — return to borrow again`
      : dueDates.upcomingCount === 0
        ? 'No books are due'
        : dueDates.upcoming[0].daysUntilDue === 0
          ? 'Next one is due today'
          : `Next one is due in ${dueDates.upcoming[0].daysUntilDue} days`;
  return (
    <>
      <div className="stat-grid">
        <SummaryCard icon={Icon.Books} label="Currently borrowed" value={borrowing.currentlyBorrowed} note="Books on loan" />
        <SummaryCard
          icon={Icon.Bookmark}
          label="Available slots"
          value={`${borrowing.availableSlots} of ${borrowing.maxActiveIssues}`}
          note="Books you can still borrow"
        />
        <SummaryCard
          icon={Icon.Clock}
          label="Upcoming due dates"
          value={dueDates.upcomingCount}
          note={upcomingNote}
          tone={dueDates.overdueCount > 0 ? 'warn' : undefined}
        />
        <SummaryCard
          icon={Icon.Rupee}
          label="Outstanding fines"
          value={formatRupees(fines.outstanding)}
          note={`₹${fines.finePerDay} per overdue day`}
          tone={fines.outstanding > 0 ? 'bad' : undefined}
        />
      </div>

      {dueDates.upcoming.length > 0 && (
        <section className="panel">
          <h2 className="section-title">Upcoming due dates</h2>
          <ul className="due-list">
            {dueDates.upcoming.map((item) => (
              <li key={item.issueId}>
                <BookCover book={{ id: item.bookId, title: item.title, author: item.author, coverUrl: item.coverUrl }} className="cover-xs" />
                <div>
                  <Link to={`/books/${item.bookId}`}>{item.title}</Link>
                  <p className="muted small">{item.author}</p>
                </div>
                <div className="due-when">
                  <strong>{dueLabel(item.daysUntilDue)}</strong>
                  <span className="muted small">{formatDate(item.dueDate)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Recommendations({ onOpen }) {
  const { data, error, loading, reload } = useApi((signal) => api.recommendations(signal), []);

  if (loading && !data) {
    return (
      <section>
        <h2 className="section-title">Recommended for you</h2>
        <BookGridSkeleton count={8} />
      </section>
    );
  }
  if (error) {
    return (
      <Banner>
        {error.message}{' '}
        <button type="button" className="link-btn" onClick={reload}>
          Try again
        </button>
      </Banner>
    );
  }
  if (data.sections.length === 0) {
    return (
      <section className="empty-state">
        <h2>No books in the catalogue yet</h2>
        <p className="muted">Recommendations appear here once titles have been added.</p>
      </section>
    );
  }

  return data.sections.map((section) => (
    <section key={section.key}>
      <h2 className="section-title">{section.label}</h2>
      {section.key === 'featured' ? (
        <div className="book-row">
          {section.items.map((book) => (
            <BookCard key={book.id} book={book} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <div className="book-grid">
          {section.items.map((book) => (
            <BookCard key={book.id} book={book} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  ));
}

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user.fullName.split(' ')[0];
  const [quickView, setQuickView] = useState(null);
  const summary = useApi((signal) => api.dashboardSummary(signal), []);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>Welcome back, {firstName}</h1>
        <p>Here is where your library account stands today.</p>
      </div>

      {summary.error && (
        <Banner>
          {summary.error.message}{' '}
          <button type="button" className="link-btn" onClick={summary.reload}>
            Try again
          </button>
        </Banner>
      )}
      {summary.loading && !summary.data && (
        <div className="stat-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat-card skeleton" key={i}>
              <div className="skeleton-line short" />
              <div className="skeleton-line" style={{ height: 30 }} />
            </div>
          ))}
        </div>
      )}
      {summary.data && <SummarySection summary={summary.data} />}

      <Recommendations onOpen={setQuickView} />

      {quickView && <QuickViewModal book={quickView} onClose={() => setQuickView(null)} />}
    </div>
  );
}
