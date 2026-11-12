import { HttpError } from '../utils/httpError.js';
import { SESSION_COOKIE, clearAuthCookies } from '../utils/cookies.js';
import { readSessionToken, validateAndTouchSession } from '../services/sessionService.js';
import { toPublicUser } from '../services/userService.js';

/**
 * Requires a valid signed-in session. On success sets req.user (public fields only) and req.sessionId.
 * Every authenticated request also counts as activity for the 30-minute inactivity timeout.
 */
export async function authenticate(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  const parsed = token ? readSessionToken(token) : null;

  if (!parsed) {
    if (token) clearAuthCookies(res);
    throw new HttpError(401, 'Please sign in to continue.', { code: 'UNAUTHENTICATED' });
  }

  const result = await validateAndTouchSession(parsed.sessionId, parsed.userId);

  if (result.status === 'expired') {
    clearAuthCookies(res);
    throw new HttpError(401, 'You were signed out after 30 minutes of inactivity. Please sign in again.', {
      code: 'SESSION_EXPIRED',
    });
  }
  if (result.status !== 'ok') {
    clearAuthCookies(res);
    throw new HttpError(401, 'Please sign in to continue.', { code: 'UNAUTHENTICATED' });
  }

  req.user = toPublicUser(result.user);
  req.sessionId = parsed.sessionId;
  next();
}

/** Role-based authorization. Use after `authenticate`: router.get('/x', authenticate, requireRole('ADMIN'), ...) */
export const requireRole =
  (...allowedRoles) =>
  (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'Please sign in to continue.', { code: 'UNAUTHENTICATED' });
    if (!allowedRoles.includes(req.user.role)) {
      throw new HttpError(403, 'You do not have permission to do that.', { code: 'FORBIDDEN' });
    }
    next();
  };
