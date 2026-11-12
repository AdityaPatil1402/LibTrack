import { query } from '../db/pool.js';
import { HttpError } from '../utils/httpError.js';

/** The only shape of a user that ever leaves the server. It never includes password_hash. */
export const toPublicUser = (row) => ({
  id: row.id,
  fullName: row.full_name,
  username: row.username,
  email: row.email,
  phone: row.phone,
  role: row.role,
  createdAt: row.created_at,
});

const PUBLIC_COLUMNS = `u.id, u.full_name, u.username, u.email, u.phone, u.created_at, r.name AS role`;

// Translate PostgreSQL unique violations into friendly field errors.
function rethrowUniqueViolation(err) {
  if (err?.code === '23505') {
    if (err.constraint === 'users_username_lower_uq') {
      throw new HttpError(409, 'This username is already taken.', {
        code: 'DUPLICATE',
        fieldErrors: { username: 'This username is already taken.' },
      });
    }
    if (err.constraint === 'users_email_lower_uq') {
      throw new HttpError(409, 'An account with this email already exists.', {
        code: 'DUPLICATE',
        fieldErrors: { email: 'An account with this email already exists.' },
      });
    }
  }
  throw err;
}

/** Looks a user up by username OR email (case-insensitive). Includes the hash: internal use only. */
export async function findForLogin(identifier, runner = query) {
  const needle = identifier.trim().toLowerCase();
  const { rows } = await runner(
    `SELECT u.id, u.password_hash, u.is_active
       FROM users u
      WHERE lower(u.username) = $1 OR lower(u.email) = $1
      LIMIT 1`,
    [needle]
  );
  return rows[0] ?? null;
}

export async function getPublicUserById(userId, runner = query) {
  const { rows } = await runner(
    `SELECT ${PUBLIC_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [userId]
  );
  return rows[0] ? toPublicUser(rows[0]) : null;
}

/** Reports which of username / email are already taken, so signup can show both problems at once. */
export async function findSignupConflicts({ username, email }) {
  const { rows } = await query(
    `SELECT (lower(username) = $1) AS username_taken, (lower(email) = $2) AS email_taken
       FROM users WHERE lower(username) = $1 OR lower(email) = $2`,
    [username.toLowerCase(), email.toLowerCase()]
  );
  const fieldErrors = {};
  if (rows.some((r) => r.username_taken)) fieldErrors.username = 'This username is already taken.';
  if (rows.some((r) => r.email_taken)) fieldErrors.email = 'An account with this email already exists.';
  return fieldErrors;
}

export async function createUser({ fullName, username, email, phone, passwordHash }) {
  try {
    const { rows } = await query(
      `INSERT INTO users (full_name, username, email, phone, password_hash, role_id)
       VALUES ($1, $2, $3, $4, $5, (SELECT id FROM roles WHERE name = 'USER'))
       RETURNING id`,
      [fullName, username, email, phone, passwordHash]
    );
    return getPublicUserById(rows[0].id);
  } catch (err) {
    return rethrowUniqueViolation(err);
  }
}

export async function recordLogin(userId) {
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
}

/** Updates only full name, email and phone. The username is permanent and is never touched here. */
export async function updateProfile(userId, { fullName, email, phone }) {
  try {
    await query(
      `UPDATE users
          SET full_name = COALESCE($2, full_name),
              email     = COALESCE($3, email),
              phone     = COALESCE($4, phone)
        WHERE id = $1`,
      [userId, fullName ?? null, email ?? null, phone ?? null]
    );
  } catch (err) {
    rethrowUniqueViolation(err);
  }
  return getPublicUserById(userId);
}
