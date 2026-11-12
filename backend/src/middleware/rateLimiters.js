import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooMany = (message) => (_req, res) => res.status(429).json({ error: message, code: 'RATE_LIMITED' });

/**
 * Created per app instance so tests start with clean counters.
 * Counters live in memory: they reset when the server restarts (fine for a single-process demo).
 * `skipSuccessfulRequests` means only FAILED attempts count against the login/password limits.
 */
export function createRateLimiters(overrides = {}) {
  const common = { standardHeaders: 'draft-7', legacyHeaders: false };

  return {
    // 5 failed attempts per account identifier per IP, then locked out for the window.
    loginPerAccount: rateLimit({
      ...common,
      windowMs: FIFTEEN_MINUTES,
      limit: overrides.loginPerAccountLimit ?? 5,
      skipSuccessfulRequests: true,
      keyGenerator: (req) =>
        `${ipKeyGenerator(req.ip)}|${String(req.body?.identifier ?? '').trim().toLowerCase().slice(0, 254)}`,
      handler: tooMany('Too many failed sign-in attempts. Please try again in 15 minutes.'),
    }),
    // 20 failed attempts per IP across all accounts (stops one machine trying many usernames).
    loginPerIp: rateLimit({
      ...common,
      windowMs: FIFTEEN_MINUTES,
      limit: overrides.loginPerIpLimit ?? 20,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      handler: tooMany('Too many failed sign-in attempts. Please try again in 15 minutes.'),
    }),
    signup: rateLimit({
      ...common,
      windowMs: 60 * 60 * 1000,
      limit: overrides.signupLimit ?? 10,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      handler: tooMany('Too many sign-up attempts. Please try again later.'),
    }),
    // Guards "current password" guessing on the password-change form. Runs after authenticate.
    passwordChange: rateLimit({
      ...common,
      windowMs: FIFTEEN_MINUTES,
      limit: overrides.passwordChangeLimit ?? 5,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => `user:${req.user?.id ?? ipKeyGenerator(req.ip)}`,
      handler: tooMany('Too many failed attempts. Please try again in 15 minutes.'),
    }),
  };
}
