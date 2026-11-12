const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const Icon = {
  Dashboard: (p) => (
    <svg {...base} {...p}><rect x="3.5" y="3.5" width="7" height="8" rx="2" /><rect x="13.5" y="3.5" width="7" height="5" rx="2" /><rect x="13.5" y="11.5" width="7" height="9" rx="2" /><rect x="3.5" y="14.5" width="7" height="6" rx="2" /></svg>
  ),
  Search: (p) => (
    <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
  ),
  Books: (p) => (
    <svg {...base} {...p}><path d="M5 4.5h9a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z" /><path d="M16 8.5h2.5a1.5 1.5 0 0 1 1.5 1.5v10" /></svg>
  ),
  Bookmark: (p) => (
    <svg {...base} {...p}><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z" /></svg>
  ),
  History: (p) => (
    <svg {...base} {...p}><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v4.5h4.5" /><path d="M12 8v4.5l3 1.8" /></svg>
  ),
  User: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.6-3.6 3.4-5.5 7-5.5s6.4 1.9 7 5.5" /></svg>
  ),
  SignOut: (p) => (
    <svg {...base} {...p}><path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" /><path d="m17 8.5 3.5 3.5L17 15.5M20.5 12H10" /></svg>
  ),
  Bell: (p) => (
    <svg {...base} {...p}><path d="M6 17.5h12l-1.4-2.2V11a4.6 4.6 0 0 0-9.2 0v4.3z" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></svg>
  ),
  Close: (p) => (
    <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>
  ),
  Clock: (p) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
  ),
  Rupee: (p) => (
    <svg {...base} {...p}><path d="M7 5.5h10M7 10h10M7 5.5h2.5a3.5 3.5 0 0 1 0 7H7l7 6.5" /></svg>
  ),
  ArrowLeft: (p) => (
    <svg {...base} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
  ),
  Chevron: (p) => (
    <svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>
  ),
};
