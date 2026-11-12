import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { CSRF_COOKIE, CSRF_HEADER } from '../utils/cookies.js';
import { HttpError } from '../utils/httpError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

/**
 * CSRF protection for every state-changing request (double-submit token):
 *  1. If the browser sends an Origin header, it must be one of our own frontend origins.
 *  2. The `lt_csrf` cookie and the `X-CSRF-Token` header must both be present and equal.
 * A malicious site can make the browser send our cookies, but it cannot read the cookie to copy it into the header.
 */
export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && !env.clientOrigins.includes(origin)) {
    throw new HttpError(403, 'Request origin is not allowed.', { code: 'ORIGIN_NOT_ALLOWED' });
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new HttpError(403, 'Security check failed. Please refresh the page and try again.', { code: 'CSRF_INVALID' });
  }
  next();
}
