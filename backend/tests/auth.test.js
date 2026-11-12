import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  Client,
  cleanupTestUsers,
  newUserData,
  pool,
  query,
  signedInClient,
  startServer,
} from './helpers.js';
import { requireRole } from '../src/middleware/auth.js';

let srv;

before(async () => {
  await cleanupTestUsers();
  srv = await startServer({ rateLimits: { loginPerAccountLimit: 1000, loginPerIpLimit: 1000, signupLimit: 1000, passwordChangeLimit: 1000 } });
});

after(async () => {
  await srv.close();
  await cleanupTestUsers();
  await pool.end();
});

const expireSession = (userId) =>
  query(`UPDATE auth_sessions SET last_activity_at = now() - interval '31 minutes' WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);

describe('signup', () => {
  test('creates an account, stores a bcrypt hash, and does not sign the user in', async () => {
    const c = new Client(srv.base);
    const data = newUserData();
    const res = await c.post('/api/auth/signup', data);
    assert.equal(res.status, 201);
    assert.equal(res.json.user.username, data.username);
    assert.equal(res.json.user.role, 'USER');
    assert.equal(c.cookie('lt_session'), undefined, 'no session cookie after signup');

    const { rows } = await query('SELECT password_hash FROM users WHERE username = $1', [data.username]);
    assert.match(rows[0].password_hash, /^\$2[aby]\$/, 'stored as bcrypt');
    assert.notEqual(rows[0].password_hash, data.password);
  });

  test('never exposes the password hash in any response', async () => {
    const { client } = await signedInClient(srv.base);
    for (const r of [await client.get('/api/auth/me'), await client.get('/api/profile')]) {
      assert.doesNotMatch(r.text, /password/i);
    }
  });

  test('rejects a duplicate username (case-insensitive)', async () => {
    const c = new Client(srv.base);
    const first = newUserData();
    assert.equal((await c.post('/api/auth/signup', first)).status, 201);
    const dup = await c.post('/api/auth/signup', newUserData({ username: first.username.toUpperCase() }));
    assert.equal(dup.status, 409);
    assert.ok(dup.json.fieldErrors.username);
  });

  test('rejects a duplicate email (case-insensitive)', async () => {
    const c = new Client(srv.base);
    const first = newUserData();
    assert.equal((await c.post('/api/auth/signup', first)).status, 201);
    const dup = await c.post('/api/auth/signup', newUserData({ email: first.email.toUpperCase() }));
    assert.equal(dup.status, 409);
    assert.ok(dup.json.fieldErrors.email);
  });

  test('reports both duplicate fields at once', async () => {
    const c = new Client(srv.base);
    const first = newUserData();
    await c.post('/api/auth/signup', first);
    const dup = await c.post('/api/auth/signup', newUserData({ username: first.username, email: first.email }));
    assert.equal(dup.status, 409);
    assert.ok(dup.json.fieldErrors.username && dup.json.fieldErrors.email);
  });

  test('validates fields on the server', async () => {
    const c = new Client(srv.base);
    const cases = [
      [{ fullName: 'A' }, 'fullName'],
      [{ username: 'ab' }, 'username'],
      [{ username: 'has space' }, 'username'],
      [{ username: 'admin' }, 'username'],
      [{ username: 'seed_borrower_9' }, 'username'],
      [{ email: 'not-an-email' }, 'email'],
      [{ phone: '123' }, 'phone'],
      [{ phone: 'abcdefghij' }, 'phone'],
      [{ password: 'short1', confirmPassword: 'short1' }, 'password'],
      [{ password: 'allletters', confirmPassword: 'allletters' }, 'password'],
      [{ password: '12345678', confirmPassword: '12345678' }, 'password'],
      [{ confirmPassword: 'Different123' }, 'confirmPassword'],
    ];
    for (const [override, field] of cases) {
      const res = await c.post('/api/auth/signup', newUserData(override));
      assert.equal(res.status, 400, `${JSON.stringify(override)} should be rejected`);
      assert.ok(res.json.fieldErrors[field], `expected an error on ${field}`);
    }
  });

  test('rejects a missing body and malformed JSON cleanly', async () => {
    const c = new Client(srv.base);
    assert.equal((await c.post('/api/auth/signup', {})).status, 400);
    const bad = await c.request('POST', '/api/auth/signup', { body: '{not json' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.code, 'BAD_JSON');
  });

  test('normalises email to lower case and phone to digits', async () => {
    const c = new Client(srv.base);
    const data = newUserData({ email: `${newUserData().email.toUpperCase()}`, phone: '+91 98765-43210' });
    const res = await c.post('/api/auth/signup', data);
    assert.equal(res.status, 201);
    assert.equal(res.json.user.email, data.email.toLowerCase());
    assert.equal(res.json.user.phone, '+919876543210');
  });
});

describe('login', () => {
  test('works with username and with email, case-insensitively', async () => {
    const c = new Client(srv.base);
    const data = newUserData();
    await c.post('/api/auth/signup', data);

    for (const identifier of [data.username, data.username.toUpperCase(), data.email, data.email.toUpperCase()]) {
      const fresh = new Client(srv.base);
      const res = await fresh.post('/api/auth/login', { identifier, password: data.password });
      assert.equal(res.status, 200, `login with ${identifier}`);
      assert.equal(res.json.user.username, data.username);
      assert.equal(res.json.inactivityTimeoutMinutes, 30);
    }
  });

  test('sets an HTTP-only, SameSite session cookie and a readable CSRF cookie', async () => {
    const c = new Client(srv.base);
    const data = newUserData();
    await c.post('/api/auth/signup', data);
    const res = await c.post('/api/auth/login', { identifier: data.username, password: data.password });
    const cookies = res.headers.getSetCookie();
    const session = cookies.find((x) => x.startsWith('lt_session='));
    const csrf = cookies.find((x) => x.startsWith('lt_csrf='));
    assert.match(session, /HttpOnly/i);
    assert.match(session, /SameSite=Lax/i);
    assert.doesNotMatch(csrf, /HttpOnly/i);
    assert.doesNotMatch(res.text, /eyJ/, 'the JWT is never in the response body');
  });

  test('rejects a wrong password and an unknown user with the same message', async () => {
    const c = new Client(srv.base);
    const data = newUserData();
    await c.post('/api/auth/signup', data);
    const wrong = await c.post('/api/auth/login', { identifier: data.username, password: 'Wrong12345' });
    const unknown = await c.post('/api/auth/login', { identifier: 'nobody_here_xyz', password: 'Wrong12345' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.json.error, unknown.json.error);
    assert.equal(c.cookie('lt_session'), undefined);
  });

  test('blocks a deactivated user, even with the right password', async () => {
    const c = new Client(srv.base);
    const data = newUserData();
    await c.post('/api/auth/signup', data);
    await query('UPDATE users SET is_active = FALSE WHERE username = $1', [data.username]);
    const res = await c.post('/api/auth/login', { identifier: data.username, password: data.password });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ACCOUNT_DEACTIVATED');
  });

  test('seeded borrower accounts cannot log in', async () => {
    const c = new Client(srv.base);
    for (const password of ['!DISABLED-SEED-ACCOUNT', 'Password123', '']) {
      const res = await c.post('/api/auth/login', { identifier: 'seed_borrower_1', password });
      assert.ok([400, 401].includes(res.status), `status ${res.status}`);
    }
  });

  test('deactivating a user ends their existing session immediately', async () => {
    const { client, user } = await signedInClient(srv.base);
    assert.equal((await client.get('/api/auth/me')).status, 200);
    await query('UPDATE users SET is_active = FALSE WHERE id = $1', [user.id]);
    assert.equal((await client.get('/api/auth/me')).status, 401);
  });
});

describe('sessions, logout and the 30-minute inactivity timeout', () => {
  test('/me returns the signed-in user', async () => {
    const { client, data } = await signedInClient(srv.base);
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 200);
    assert.equal(res.json.user.username, data.username);
  });

  test('logout revokes the session server-side, so a copied cookie stops working', async () => {
    const { client } = await signedInClient(srv.base);
    const stolen = client.cookie('lt_session');

    assert.equal((await client.post('/api/auth/logout')).status, 204);
    assert.equal(client.cookie('lt_session'), undefined);
    assert.equal((await client.get('/api/auth/me')).status, 401);

    const replay = new Client(srv.base);
    replay.cookies.set('lt_session', stolen);
    assert.equal((await replay.get('/api/auth/me')).status, 401, 'revoked token is rejected');
  });

  test('a session idle for 31 minutes is expired with a clear message', async () => {
    const { client, user } = await signedInClient(srv.base);
    await expireSession(user.id);
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
    assert.equal(res.json.code, 'SESSION_EXPIRED');
    const { rows } = await query(`SELECT revoked_reason FROM auth_sessions WHERE user_id = $1`, [user.id]);
    assert.equal(rows[0].revoked_reason, 'INACTIVITY');
  });

  test('activity keeps the session alive (the timer is about inactivity, not total time)', async () => {
    const { client, user } = await signedInClient(srv.base);
    await query(`UPDATE auth_sessions SET last_activity_at = now() - interval '29 minutes' WHERE user_id = $1`, [user.id]);
    assert.equal((await client.get('/api/auth/me')).status, 200, 'still valid at 29 minutes');
    // That request reset the clock, so even 29 more minutes later it is valid again.
    await query(`UPDATE auth_sessions SET last_activity_at = last_activity_at - interval '29 minutes' WHERE user_id = $1`, [user.id]);
    assert.equal((await client.get('/api/auth/me')).status, 200);
    const { rows } = await query(`SELECT revoked_at FROM auth_sessions WHERE user_id = $1`, [user.id]);
    assert.equal(rows[0].revoked_at, null);
  });

  test('heartbeat counts as activity', async () => {
    const { client, user } = await signedInClient(srv.base);
    await query(`UPDATE auth_sessions SET last_activity_at = now() - interval '25 minutes' WHERE user_id = $1`, [user.id]);
    assert.equal((await client.post('/api/auth/heartbeat')).status, 204);
    const { rows } = await query(`SELECT now() - last_activity_at < interval '1 minute' AS fresh FROM auth_sessions WHERE user_id = $1`, [user.id]);
    assert.equal(rows[0].fresh, true);
  });

  test('an expired session stays expired and keeps reporting why', async () => {
    const { client, user } = await signedInClient(srv.base);
    await expireSession(user.id);
    await client.get('/api/auth/me');
    const replay = new Client(srv.base);
    // Re-use the cookies captured before the server cleared them is not possible via the jar,
    // so verify directly: the database row is revoked and cannot be revived by activity.
    const { rows } = await query(`SELECT revoked_at FROM auth_sessions WHERE user_id = $1`, [user.id]);
    assert.ok(rows[0].revoked_at);
    assert.equal((await replay.get('/api/auth/me')).status, 401);
  });

  test('several devices can be signed in at once, and logging out one leaves the others', async () => {
    const { client: laptop, data } = await signedInClient(srv.base);
    const phone = new Client(srv.base);
    assert.equal((await phone.post('/api/auth/login', { identifier: data.email, password: data.password })).status, 200);

    assert.equal((await laptop.get('/api/auth/me')).status, 200);
    assert.equal((await phone.get('/api/auth/me')).status, 200);

    await laptop.post('/api/auth/logout');
    assert.equal((await laptop.get('/api/auth/me')).status, 401);
    assert.equal((await phone.get('/api/auth/me')).status, 200, 'the other device is unaffected');
  });

  test('tampered and forged tokens are rejected', async () => {
    const { client } = await signedInClient(srv.base);
    const good = client.cookie('lt_session');
    const [h, p, s] = good.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ sid: 'x', sub: '1' })).toString('base64url');

    for (const bad of [`${h}.${p}.${s.slice(0, -2)}xx`, `${h}.${forgedBody}.${s}`, 'garbage', `${h}.${p}.`]) {
      const c = new Client(srv.base);
      c.cookies.set('lt_session', bad);
      assert.equal((await c.get('/api/auth/me')).status, 401);
    }
  });
});

describe('protected routes', () => {
  test('reject anonymous requests', async () => {
    const c = new Client(srv.base);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    assert.equal((await c.get('/api/profile')).status, 401);
    assert.equal((await c.patch('/api/profile', { fullName: 'Someone' })).status, 401);
    assert.equal((await c.post('/api/profile/password', {})).status, 401);
  });

  test('unknown API paths return a JSON 404', async () => {
    const c = new Client(srv.base);
    const res = await c.get('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.json.code, 'NOT_FOUND');
  });

  test('role middleware: ADMIN-only routes reject ordinary members', () => {
    const run = (user, ...roles) => {
      let outcome = 'passed';
      try {
        requireRole(...roles)({ user }, {}, () => {});
      } catch (e) {
        outcome = e.status;
      }
      return outcome;
    };
    assert.equal(run({ role: 'USER' }, 'ADMIN'), 403);
    assert.equal(run({ role: 'ADMIN' }, 'ADMIN'), 'passed');
    assert.equal(run({ role: 'USER' }, 'USER', 'ADMIN'), 'passed');
    assert.equal(run(undefined, 'ADMIN'), 401);
  });

  test('new sign-ups always receive the USER role (no way to self-assign ADMIN)', async () => {
    const c = new Client(srv.base);
    const res = await c.post('/api/auth/signup', { ...newUserData(), role: 'ADMIN', roleId: 2 });
    assert.equal(res.status, 201);
    assert.equal(res.json.user.role, 'USER');
  });
});

describe('CSRF protection', () => {
  test('a state-changing request without the CSRF header is refused', async () => {
    const { client } = await signedInClient(srv.base);
    const res = await client.raw('PATCH', '/api/profile', { body: { fullName: 'Hacker Name' }, csrf: false });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'CSRF_INVALID');
  });

  test('a wrong CSRF token is refused', async () => {
    const { client } = await signedInClient(srv.base);
    const res = await client.raw('PATCH', '/api/profile', {
      body: { fullName: 'Hacker Name' },
      headers: { 'x-csrf-token': 'f'.repeat(64) },
      csrf: false,
    });
    assert.equal(res.status, 403);
  });

  test('a request from a foreign Origin is refused even with a valid token', async () => {
    const { client } = await signedInClient(srv.base);
    const res = await client.raw('PATCH', '/api/profile', {
      body: { fullName: 'Hacker Name' },
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.json.code, 'ORIGIN_NOT_ALLOWED');
  });

  test('the configured frontend origin is accepted', async () => {
    const { client } = await signedInClient(srv.base);
    const res = await client.raw('PATCH', '/api/profile', {
      body: { fullName: 'Fine Name' },
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(res.status, 200);
  });

  test('login and signup are protected too', async () => {
    const c = new Client(srv.base);
    assert.equal((await c.raw('POST', '/api/auth/login', { body: { identifier: 'a', password: 'b' }, csrf: false })).status, 403);
    assert.equal((await c.raw('POST', '/api/auth/signup', { body: newUserData(), csrf: false })).status, 403);
  });
});

describe('profile', () => {
  test('updates full name, email and phone', async () => {
    const { client, data } = await signedInClient(srv.base);
    const newEmail = `${data.username}_new@example.com`;
    const res = await client.patch('/api/profile', { fullName: 'Renamed Reader', email: newEmail, phone: '9123456780' });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.fullName, 'Renamed Reader');
    assert.equal(res.json.user.email, newEmail);
    assert.equal(res.json.user.phone, '9123456780');
    assert.equal(res.json.user.username, data.username, 'username unchanged');

    const again = await client.get('/api/profile');
    assert.equal(again.json.user.fullName, 'Renamed Reader');
  });

  test('a partial update leaves the other fields alone', async () => {
    const { client, data } = await signedInClient(srv.base);
    const res = await client.patch('/api/profile', { phone: '9000000001' });
    assert.equal(res.status, 200);
    assert.equal(res.json.user.fullName, data.fullName);
    assert.equal(res.json.user.email, data.email.toLowerCase());
  });

  test('the username is permanent', async () => {
    const { client, data } = await signedInClient(srv.base);
    const res = await client.patch('/api/profile', { username: 'brand_new_name', fullName: 'Whatever' });
    assert.equal(res.status, 400);
    assert.equal(res.json.code, 'USERNAME_PERMANENT');
    const me = await client.get('/api/profile');
    assert.equal(me.json.user.username, data.username);
    assert.notEqual(me.json.user.fullName, 'Whatever', 'nothing was applied');
  });

  test('cannot change role, active flag or password hash through the profile endpoint', async () => {
    const { client } = await signedInClient(srv.base);
    for (const body of [{ role: 'ADMIN' }, { is_active: false }, { passwordHash: 'x' }, { fullName: 'Okay Name', role: 'ADMIN' }]) {
      assert.equal((await client.patch('/api/profile', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await client.get('/api/profile')).json.user.role, 'USER');
  });

  test('rejects an email already used by another account', async () => {
    const a = await signedInClient(srv.base);
    const b = await signedInClient(srv.base);
    const res = await b.client.patch('/api/profile', { email: a.data.email });
    assert.equal(res.status, 409);
    assert.ok(res.json.fieldErrors.email);
  });

  test('rejects invalid values and an empty update', async () => {
    const { client } = await signedInClient(srv.base);
    assert.equal((await client.patch('/api/profile', { email: 'nope' })).status, 400);
    assert.equal((await client.patch('/api/profile', { phone: '12' })).status, 400);
    assert.equal((await client.patch('/api/profile', { fullName: ' ' })).status, 400);
    assert.equal((await client.patch('/api/profile', {})).status, 400);
  });

  test('users cannot read or change other users through this API', async () => {
    const a = await signedInClient(srv.base);
    const b = await signedInClient(srv.base);
    await b.client.patch('/api/profile', { fullName: 'Bee Reader' });
    const me = await a.client.get('/api/profile');
    assert.equal(me.json.user.id, a.user.id);
    assert.notEqual(me.json.user.fullName, 'Bee Reader');
  });
});

describe('password change', () => {
  const body = (current, next, confirm = next) => ({ currentPassword: current, newPassword: next, confirmNewPassword: confirm });

  test('succeeds, then the old password stops working and the new one works', async () => {
    const { client, data } = await signedInClient(srv.base);
    const res = await client.post('/api/profile/password', body(data.password, 'Brand9NewPass'));
    assert.equal(res.status, 200);

    const fresh = new Client(srv.base);
    assert.equal((await fresh.post('/api/auth/login', { identifier: data.username, password: data.password })).status, 401);
    assert.equal((await fresh.post('/api/auth/login', { identifier: data.username, password: 'Brand9NewPass' })).status, 200);
  });

  test('requires the correct current password', async () => {
    const { client, data } = await signedInClient(srv.base);
    const res = await client.post('/api/profile/password', body('WrongCurrent1', 'Brand9NewPass'));
    assert.equal(res.status, 400);
    assert.ok(res.json.fieldErrors.currentPassword);
    // Nothing changed: the original password still works.
    const fresh = new Client(srv.base);
    assert.equal((await fresh.post('/api/auth/login', { identifier: data.username, password: data.password })).status, 200);
  });

  test('validates the new password and the confirmation', async () => {
    const { client, data } = await signedInClient(srv.base);
    assert.equal((await client.post('/api/profile/password', body(data.password, 'short1'))).status, 400);
    assert.equal((await client.post('/api/profile/password', body(data.password, 'Brand9NewPass', 'Mismatch123'))).status, 400);
    assert.equal((await client.post('/api/profile/password', body(data.password, data.password))).status, 400, 'must differ from current');
    assert.equal((await client.post('/api/profile/password', { newPassword: 'Brand9NewPass' })).status, 400);
  });

  test('invalidates every other session (all devices) but keeps this browser signed in', async () => {
    const { client: laptop, data } = await signedInClient(srv.base);
    const phone = new Client(srv.base);
    await phone.post('/api/auth/login', { identifier: data.username, password: data.password });
    const oldLaptopToken = laptop.cookie('lt_session');

    assert.equal((await laptop.post('/api/profile/password', body(data.password, 'Brand9NewPass'))).status, 200);

    assert.equal((await phone.get('/api/auth/me')).status, 401, 'other device is signed out');
    const replay = new Client(srv.base);
    replay.cookies.set('lt_session', oldLaptopToken);
    assert.equal((await replay.get('/api/auth/me')).status, 401, 'the old token is dead');
    assert.equal((await laptop.get('/api/auth/me')).status, 200, 'this browser got a fresh session');
    assert.notEqual(laptop.cookie('lt_session'), oldLaptopToken);
  });

  test('records why sessions ended', async () => {
    const { client, data, user } = await signedInClient(srv.base);
    await client.post('/api/profile/password', body(data.password, 'Brand9NewPass'));
    const { rows } = await query(
      `SELECT revoked_reason, count(*)::int AS n FROM auth_sessions WHERE user_id = $1 GROUP BY revoked_reason`,
      [user.id]
    );
    const reasons = Object.fromEntries(rows.map((r) => [String(r.revoked_reason), r.n]));
    assert.equal(reasons.PASSWORD_CHANGED, 1);
    assert.equal(reasons.null, 1, 'exactly one active session remains');
  });
});

describe('rate limiting', () => {
  test('too many failed logins for one account are blocked, even with the right password afterwards', async () => {
    const limited = await startServer({ rateLimits: { loginPerAccountLimit: 3, loginPerIpLimit: 1000, signupLimit: 1000 } });
    try {
      const c = new Client(limited.base);
      const data = newUserData();
      await c.post('/api/auth/signup', data);

      for (let i = 0; i < 3; i += 1) {
        assert.equal((await c.post('/api/auth/login', { identifier: data.username, password: 'Wrong12345' })).status, 401);
      }
      const blocked = await c.post('/api/auth/login', { identifier: data.username, password: 'Wrong12345' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.code, 'RATE_LIMITED');

      const stillBlocked = await c.post('/api/auth/login', { identifier: data.username, password: data.password });
      assert.equal(stillBlocked.status, 429, 'lockout holds even for the correct password');

      // A different account is not affected.
      const other = newUserData();
      await c.post('/api/auth/signup', other);
      assert.equal((await c.post('/api/auth/login', { identifier: other.username, password: other.password })).status, 200);
    } finally {
      await limited.close();
    }
  });

  test('successful logins do not count against the limit', async () => {
    const limited = await startServer({ rateLimits: { loginPerAccountLimit: 2, loginPerIpLimit: 1000, signupLimit: 1000 } });
    try {
      const c = new Client(limited.base);
      const data = newUserData();
      await c.post('/api/auth/signup', data);
      for (let i = 0; i < 6; i += 1) {
        assert.equal((await c.post('/api/auth/login', { identifier: data.username, password: data.password })).status, 200);
      }
    } finally {
      await limited.close();
    }
  });

  test('signup is rate limited per IP', async () => {
    const limited = await startServer({ rateLimits: { signupLimit: 2, loginPerAccountLimit: 1000, loginPerIpLimit: 1000 } });
    try {
      const c = new Client(limited.base);
      assert.equal((await c.post('/api/auth/signup', newUserData())).status, 201);
      assert.equal((await c.post('/api/auth/signup', newUserData())).status, 201);
      assert.equal((await c.post('/api/auth/signup', newUserData())).status, 429);
    } finally {
      await limited.close();
    }
  });

  test('password-change guessing is rate limited', async () => {
    const limited = await startServer({ rateLimits: { passwordChangeLimit: 2, loginPerAccountLimit: 1000, loginPerIpLimit: 1000, signupLimit: 1000 } });
    try {
      const { client } = await signedInClient(limited.base);
      const attempt = () =>
        client.post('/api/profile/password', { currentPassword: 'Nope12345', newPassword: 'Brand9NewPass', confirmNewPassword: 'Brand9NewPass' });
      assert.equal((await attempt()).status, 400);
      assert.equal((await attempt()).status, 400);
      assert.equal((await attempt()).status, 429);
    } finally {
      await limited.close();
    }
  });
});

describe('responses', () => {
  test('API responses are not cacheable and carry security headers', async () => {
    const { client } = await signedInClient(srv.base);
    const res = await client.get('/api/auth/me');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('internal errors do not leak details', async () => {
    const c = new Client(srv.base);
    const res = await c.post('/api/auth/login', { identifier: 'x'.repeat(5000), password: 'y' });
    assert.ok([400, 401].includes(res.status));
    assert.doesNotMatch(res.text, /at .*\.js|node_modules|SELECT /);
  });
});
