import { Router } from 'express';
import { HttpError } from '../utils/httpError.js';
import { loginSchema, parseOrThrow, signupSchema } from '../utils/validation.js';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  clearAuthCookies,
  newCsrfToken,
  setCsrfCookie,
  setSessionCookie,
} from '../utils/cookies.js';
import { hashPassword, verifyPassword } from '../services/passwordService.js';
import {
  createSession,
  getInactivityMinutes,
  readSessionToken,
  revokeSession,
  signSessionToken,
} from '../services/sessionService.js';
import {
  createUser,
  findForLogin,
  findSignupConflicts,
  getPublicUserById,
  recordLogin,
} from '../services/userService.js';
import { authenticate } from '../middleware/auth.js';

export function createAuthRouter(limiters) {
  const router = Router();

  // Issues the CSRF token the frontend must echo back in the X-CSRF-Token header.
  router.get('/csrf', (req, res) => {
    let token = req.cookies?.[CSRF_COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      token = newCsrfToken();
      setCsrfCookie(res, token);
    }
    res.json({ csrfToken: token });
  });

  router.post('/signup', limiters.signup, async (req, res) => {
    const data = parseOrThrow(signupSchema, req.body);

    const conflicts = await findSignupConflicts(data);
    if (Object.keys(conflicts).length > 0) {
      throw new HttpError(409, Object.values(conflicts)[0], { code: 'DUPLICATE', fieldErrors: conflicts });
    }

    const passwordHash = await hashPassword(data.password);
    const user = await createUser({
      fullName: data.fullName,
      username: data.username,
      email: data.email,
      phone: data.phone,
      passwordHash,
    });
    // Signing up does not sign the user in: they continue to the login screen.
    res.status(201).json({ user, message: 'Account created. You can now sign in.' });
  });

  router.post('/login', limiters.loginPerIp, limiters.loginPerAccount, async (req, res) => {
    const { identifier, password } = parseOrThrow(loginSchema, req.body);

    const found = await findForLogin(identifier);
    // Always verify (against a dummy hash if the user is unknown) so timing does not leak which accounts exist.
    const passwordOk = await verifyPassword(password, found?.password_hash);
    if (!found || !passwordOk) {
      throw new HttpError(401, 'Invalid username/email or password.', { code: 'INVALID_CREDENTIALS' });
    }
    if (!found.is_active) {
      throw new HttpError(403, 'This account has been deactivated. Please contact the library.', {
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    const sessionId = await createSession(found.id, { userAgent: req.get('user-agent'), ip: req.ip });
    await recordLogin(found.id);

    setSessionCookie(res, signSessionToken(sessionId, found.id));
    setCsrfCookie(res, newCsrfToken());
    res.json({
      user: await getPublicUserById(found.id),
      inactivityTimeoutMinutes: await getInactivityMinutes(),
    });
  });

  // Works even if the session already lapsed, so the browser always ends up signed out.
  router.post('/logout', async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const parsed = token ? readSessionToken(token) : null;
    if (parsed) await revokeSession(parsed.sessionId, 'LOGOUT');
    clearAuthCookies(res);
    res.status(204).end();
  });

  router.get('/me', authenticate, async (req, res) => {
    res.json({ user: req.user, inactivityTimeoutMinutes: await getInactivityMinutes() });
  });

  // The frontend calls this while the person is actively using the page without making other requests,
  // so reading a long page is not mistaken for inactivity.
  router.post('/heartbeat', authenticate, (_req, res) => {
    res.status(204).end();
  });

  return router;
}
