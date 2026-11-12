import crypto from 'node:crypto';
import { env } from '../config/env.js';

export const SESSION_COOKIE = 'lt_session';
export const CSRF_COOKIE = 'lt_csrf';
export const CSRF_HEADER = 'x-csrf-token';

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // outer bound; inactivity is enforced server-side

const baseOptions = () => ({
  sameSite: 'lax',
  secure: env.isProduction, // plain HTTP is fine on localhost during development
  path: '/',
  maxAge: COOKIE_MAX_AGE_MS,
});

export const newCsrfToken = () => crypto.randomBytes(32).toString('hex');

/** The JWT lives in an HTTP-only cookie: JavaScript in the page can never read it. */
export function setSessionCookie(res, jwtToken) {
  res.cookie(SESSION_COOKIE, jwtToken, { ...baseOptions(), httpOnly: true });
}

/** The CSRF token must be readable by the frontend so it can echo it in a header. */
export function setCsrfCookie(res, token) {
  res.cookie(CSRF_COOKIE, token, { ...baseOptions(), httpOnly: false });
}

export function clearAuthCookies(res) {
  const { maxAge, ...options } = baseOptions();
  res.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}
