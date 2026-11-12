// Thin fetch wrapper for the LibTrack API.
// - Always sends the session cookie (same origin through the Vite proxy).
// - Adds the CSRF token header on every state-changing request.
// - Turns error responses into ApiError objects with per-field messages.

const CSRF_COOKIE = 'lt_csrf';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.code;
    this.fieldErrors = body?.fieldErrors || {};
  }
}

let unauthorizedHandler = null;
/** Called when the server says the session is gone (expired or signed out elsewhere). */
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};

function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function csrfToken() {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  return (await res.json()).csrfToken;
}

async function request(method, path, body, signal) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await csrfToken();

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, {
      error: 'Cannot reach the server. Check that the backend is running.',
      code: 'NETWORK',
    });
  }

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    const error = new ApiError(res.status, data);
    if (res.status === 401 && (error.code === 'SESSION_EXPIRED' || error.code === 'UNAUTHENTICATED')) {
      unauthorizedHandler?.(error);
    }
    throw error;
  }
  return data;
}

export const api = {
  signup: (values) => request('POST', '/api/auth/signup', values),
  login: (identifier, password) => request('POST', '/api/auth/login', { identifier, password }),
  logout: () => request('POST', '/api/auth/logout'),
  me: () => request('GET', '/api/auth/me'),
  heartbeat: () => request('POST', '/api/auth/heartbeat'),
  updateProfile: (values) => request('PATCH', '/api/profile', values),
  changePassword: (values) => request('POST', '/api/profile/password', values),

  // Catalogue and dashboard (read-only)
  dashboardSummary: (signal) => request('GET', '/api/dashboard/summary', undefined, signal),
  recommendations: (signal) => request('GET', '/api/catalogue/recommendations', undefined, signal),
  filterOptions: (signal) => request('GET', '/api/catalogue/filters', undefined, signal),
  searchBooks: (params, signal) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    return request('GET', `/api/catalogue/books?${query}`, undefined, signal);
  },
  // Issuing and My Books
  issueEligibility: (bookId, signal) => request('GET', `/api/issues/eligibility?bookId=${encodeURIComponent(bookId)}`, undefined, signal),
  issueBook: (bookId) => request('POST', '/api/issues', { bookId }),
  myBooks: (signal) => request('GET', '/api/issues/mine', undefined, signal),
  book: (id, signal) => request('GET', `/api/catalogue/books/${encodeURIComponent(id)}`, undefined, signal),
};

/** Splits an ApiError into messages for individual fields and one general message. */
export function describeError(err) {
  const fieldErrors = { ...(err.fieldErrors || {}) };
  const formError = fieldErrors._form || (Object.keys(fieldErrors).length === 0 ? err.message : '');
  delete fieldErrors._form;
  return { fieldErrors, formError };
}
