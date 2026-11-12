import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { FullScreenSpinner, Logo } from './ui.jsx';
import { Icon } from './icons.jsx';
import { initials } from '../lib/format.js';

/** Only signed-in members get through; everyone else is sent to the login screen. */
export function ProtectedRoute() {
  const { status, signedOutByUser } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'anon') {
    // Remember the page so a timeout or a deep link returns there after sign-in,
    // but not after a deliberate "Sign out": that starts fresh at the dashboard.
    const state = signedOutByUser ? undefined : { from: location.pathname };
    return <Navigate to="/login" replace state={state} />;
  }
  return <AppShell />;
}

/** Login and signup are for signed-out visitors; signed-in members go to their dashboard. */
export function PublicOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authed') return <Navigate to={location.state?.from || '/dashboard'} replace />;
  return <Outlet />;
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: Icon.Dashboard },
  { to: '/search', label: 'Search Books', icon: Icon.Search },
  { to: '/my-books', label: 'My Books', icon: Icon.Books },
  { to: '/reservations', label: 'Reservations', icon: Icon.Bookmark },
  { to: '/reservation-history', label: 'Reservation History', icon: Icon.History },
  { to: '/profile', label: 'Profile', icon: Icon.User },
];

/** Closes a popover when the user clicks outside it or presses Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [text, setText] = useState('');

  // Keep the box in step with the search page's query; clear it elsewhere.
  useEffect(() => {
    setText(location.pathname === '/search' ? params.get('q') || '' : '');
  }, [location.pathname, params]);

  const submit = (event) => {
    event.preventDefault();
    const q = text.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <form className="global-search" role="search" onSubmit={submit}>
      <Icon.Search width={17} height={17} />
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Search by title or ISBN"
        aria-label="Search books by title or ISBN"
        maxLength={100}
      />
    </form>
  );
}

function NotificationBell() {
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="popover-host" ref={ref}>
      <button type="button" className="icon-btn" onClick={() => setOpen(!open)} aria-label="Notifications" aria-expanded={open}>
        <Icon.Bell />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Notifications">
          <h3>Notifications</h3>
          <p className="muted small">
            The notification centre is built in Phase 7. Nothing is shown here yet, and no notifications are being
            hidden from you.
          </p>
        </div>
      )}
    </div>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="popover-host" ref={ref}>
      <button type="button" className="avatar-btn" onClick={() => setOpen(!open)} aria-label="Account menu" aria-expanded={open}>
        <span className="avatar">{initials(user.fullName)}</span>
      </button>
      {open && (
        <div className="popover popover-right" role="menu">
          <div className="menu-head">
            <span className="avatar avatar-lg">{initials(user.fullName)}</span>
            <div>
              <strong>{user.fullName}</strong>
              <p className="muted small">@{user.username}</p>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
          >
            <Icon.User width={17} height={17} /> Profile
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={logout}>
            <Icon.SignOut width={17} height={17} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function AppShell() {
  const { logout } = useAuth();
  const { pathname } = useLocation();
  const narrow = pathname === '/profile';

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo size={30} />
          <span>LibTrack</span>
        </div>
        <nav aria-label="Main">
          {NAV_ITEMS.map(({ to, label, icon: NavIcon }) => (
            <NavLink key={to} to={to} className="side-link" title={label}>
              <NavIcon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button type="button" className="side-link side-signout" onClick={logout} title="Sign Out">
          <Icon.SignOut />
          <span>Sign Out</span>
        </button>
      </aside>

      <div className="shell-main">
        <header className="topbar-v2">
          <GlobalSearch />
          <div className="topbar-actions">
            <NotificationBell />
            <ProfileMenu />
          </div>
        </header>
        <main className={`page${narrow ? ' page-narrow' : ''}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Split-screen frame shared by the login and signup screens. */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="auth-screen">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-brand-logo">
            <Logo size={40} />
            <span>LibTrack</span>
          </div>
          <h2>
            Your library,
            <br />
            <span className="grad-text">beautifully organised.</span>
          </h2>
          <p>Borrow, renew and return books, follow waiting lists and keep every due date in view.</p>
        </div>
        <p className="auth-brand-foot">Academic demo project</p>
      </aside>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo">
            <Logo size={32} />
            <span>LibTrack</span>
          </div>
          <h1>{title}</h1>
          <p className="auth-sub">{subtitle}</p>
          {children}
          <p className="auth-footer">{footer}</p>
        </div>
      </section>
    </div>
  );
}
