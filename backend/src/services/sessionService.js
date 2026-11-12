import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

const JWT_OPTIONS = { algorithm: 'HS256', issuer: 'libtrack' };
const JWT_LIFETIME = '7d'; // outer bound only; the 30-minute inactivity rule is enforced from the database

// ---- Inactivity timeout (from system_config, cached briefly) ---------------------------------
let cachedMinutes = { value: 30, loadedAt: 0 };

export async function getInactivityMinutes(runner = query) {
  if (Date.now() - cachedMinutes.loadedAt < 30_000) return cachedMinutes.value;
  const { rows } = await runner(
    `SELECT (value #>> '{}')::int AS minutes FROM system_config WHERE key = 'session_inactivity_minutes'`
  );
  cachedMinutes = { value: rows[0]?.minutes ?? 30, loadedAt: Date.now() };
  return cachedMinutes.value;
}

// ---- JWT ---------------------------------------------------------------------------------------
export function signSessionToken(sessionId, userId) {
  return jwt.sign({ sid: sessionId }, env.jwtSecret, {
    ...JWT_OPTIONS,
    subject: String(userId),
    expiresIn: JWT_LIFETIME,
  });
}

/** Returns { sessionId, userId } or null if the token is missing, forged, malformed or expired. */
export function readSessionToken(token) {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: [JWT_OPTIONS.algorithm], issuer: JWT_OPTIONS.issuer });
    const userId = Number(payload.sub);
    if (typeof payload.sid !== 'string' || !Number.isInteger(userId)) return null;
    return { sessionId: payload.sid, userId };
  } catch {
    return null;
  }
}

// ---- Sessions ----------------------------------------------------------------------------------
/** Creates a new session row (each login gets its own, so several devices can be signed in). */
export async function createSession(userId, { userAgent, ip } = {}, runner = query) {
  const { rows } = await runner(
    `INSERT INTO auth_sessions (user_id, user_agent, ip_address) VALUES ($1, $2, $3) RETURNING id`,
    [userId, userAgent ? String(userAgent).slice(0, 300) : null, ip || null]
  );
  return rows[0].id;
}

/**
 * Checks a session and, if it is valid, records activity (this is what makes the timeout "inactivity").
 * Returns { status: 'ok', user } or { status: 'expired' | 'invalid' }.
 */
export async function validateAndTouchSession(sessionId, userId) {
  const minutes = await getInactivityMinutes();

  const { rows } = await query(
    `UPDATE auth_sessions s
        SET last_activity_at = now()
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE s.id = $1 AND s.user_id = $2 AND u.id = s.user_id
        AND s.revoked_at IS NULL
        AND u.is_active
        AND s.last_activity_at > now() - make_interval(mins => $3::int)
      RETURNING u.id, u.full_name, u.username, u.email, u.phone, u.created_at, r.name AS role`,
    [sessionId, userId, minutes]
  );
  if (rows.length === 1) return { status: 'ok', user: rows[0] };

  // Not valid. If it lapsed through inactivity, record that and tell the client why.
  const expired = await query(
    `UPDATE auth_sessions s
        SET revoked_at = now(), revoked_reason = 'INACTIVITY'
       FROM users u
      WHERE s.id = $1 AND s.user_id = $2 AND u.id = s.user_id AND u.is_active
        AND s.revoked_at IS NULL
        AND s.last_activity_at <= now() - make_interval(mins => $3::int)
      RETURNING s.id`,
    [sessionId, userId, minutes]
  );
  if (expired.rowCount === 1) return { status: 'expired' };

  // Already expired earlier by inactivity? Keep reporting that so the user sees the right message.
  const prior = await query(
    `SELECT revoked_reason FROM auth_sessions WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
  if (prior.rows[0]?.revoked_reason === 'INACTIVITY') return { status: 'expired' };

  return { status: 'invalid' };
}

export async function revokeSession(sessionId, reason, runner = query) {
  await runner(
    `UPDATE auth_sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId, reason]
  );
}

/** Revokes every active session of a user (used when the password changes). */
export async function revokeAllSessionsForUser(userId, reason, runner = query) {
  const { rowCount } = await runner(
    `UPDATE auth_sessions SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason]
  );
  return rowCount;
}
