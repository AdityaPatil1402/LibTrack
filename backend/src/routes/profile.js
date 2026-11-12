import { Router } from 'express';
import { withTransaction } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';
import { parseOrThrow, passwordChangeSchema, profileUpdateSchema } from '../utils/validation.js';
import { newCsrfToken, setCsrfCookie, setSessionCookie } from '../utils/cookies.js';
import { hashPassword, verifyPassword } from '../services/passwordService.js';
import { createSession, revokeAllSessionsForUser, signSessionToken } from '../services/sessionService.js';
import { getPublicUserById, updateProfile } from '../services/userService.js';
import { authenticate } from '../middleware/auth.js';

export function createProfileRouter(limiters) {
  const router = Router();
  router.use(authenticate);

  router.get('/', (req, res) => {
    res.json({ user: req.user });
  });

  // Members may change full name, email and phone only. The username is permanent.
  router.patch('/', async (req, res) => {
    if (req.body && Object.hasOwn(req.body, 'username')) {
      throw new HttpError(400, 'Username cannot be changed.', {
        code: 'USERNAME_PERMANENT',
        fieldErrors: { username: 'Username cannot be changed.' },
      });
    }
    const changes = parseOrThrow(profileUpdateSchema, req.body);
    const user = await updateProfile(req.user.id, changes);
    res.json({ user, message: 'Profile updated.' });
  });

  router.post('/password', limiters.passwordChange, async (req, res) => {
    const data = parseOrThrow(passwordChangeSchema, req.body);
    const userId = req.user.id;

    const sessionId = await withTransaction(async (client) => {
      const run = (text, params) => client.query(text, params);

      const { rows } = await client.query('SELECT password_hash FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const currentHash = rows[0].password_hash;

      if (!(await verifyPassword(data.currentPassword, currentHash))) {
        throw new HttpError(400, 'Your current password is incorrect.', {
          code: 'INVALID_CURRENT_PASSWORD',
          fieldErrors: { currentPassword: 'Your current password is incorrect.' },
        });
      }
      if (await verifyPassword(data.newPassword, currentHash)) {
        throw new HttpError(400, 'Choose a password you have not used for this account right now.', {
          code: 'PASSWORD_UNCHANGED',
          fieldErrors: { newPassword: 'The new password must be different from your current password.' },
        });
      }

      await client.query('UPDATE users SET password_hash = $2, password_changed_at = now() WHERE id = $1', [
        userId,
        await hashPassword(data.newPassword),
      ]);

      // Invalidate every existing session (all devices), then start a fresh one for this browser
      // so the person is not thrown out of the page they just used.
      await revokeAllSessionsForUser(userId, 'PASSWORD_CHANGED', run);
      return createSession(userId, { userAgent: req.get('user-agent'), ip: req.ip }, run);
    });

    setSessionCookie(res, signSessionToken(sessionId, userId));
    setCsrfCookie(res, newCsrfToken());
    res.json({
      user: await getPublicUserById(userId),
      message: 'Password changed. You have been signed out on all other devices.',
    });
  });

  return router;
}
