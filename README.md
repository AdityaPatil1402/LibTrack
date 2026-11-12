# LibTrack

A library management system: React frontend, Node.js + Express backend, PostgreSQL database.

**Current state: Phase 4 built (Phases 1 to 3 complete)** (Phase 1: setup, schema, migrations, seed data. Phase 2: authentication
and user accounts). The dashboard, catalogue and borrowing workflows are built in later phases.

## Prerequisites

- Node.js 20 or newer (`node -v`)
- PostgreSQL 18 (also works on 16 and 17; the SQL is standard)
- pgAdmin 4 (optional, handy for browsing tables)

## 1. Configure PostgreSQL

Use the server you already connect to from pgAdmin 4. Check its details in pgAdmin:
right-click the server, Properties, Connection tab (host, port, username).

Confirm the server and version from PowerShell (it prompts for the password):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -c "SELECT version();"
```

### Create the database

Pick one option.

**Option A: pgAdmin 4.** Right-click Databases, Create, Database, name it `libtrack`.

**Option B: psql.**

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -p 5432 -c "CREATE DATABASE libtrack;"
```

**Option C: the project script** (after step 2 below): `npm run db:create`

Using the `postgres` superuser for local development is fine. For a tidier setup, create a dedicated user:

```sql
CREATE ROLE libtrack_app WITH LOGIN PASSWORD 'choose-a-password';
CREATE DATABASE libtrack OWNER libtrack_app;
```

## 2. Configure environment variables

```powershell
cd backend
copy .env.example .env
```

Edit `backend/.env` and set `DB_USER` and `DB_PASSWORD`. `DB_HOST=localhost`, `DB_PORT=5432` and
`DB_NAME=libtrack` already match a default local install. `.env` is git-ignored; never commit it.

**Phase 2 needs one more value, `JWT_SECRET`** (it signs the login cookie; the server refuses to start
without it). Generate one in the terminal and paste the output after `JWT_SECRET=` in `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Keep `BCRYPT_COST=12` (password hashing strength). If you already have a `.env` from Phase 1, add the two
lines `JWT_SECRET=...` and `BCRYPT_COST=12` to it.

## 3. Install, migrate and seed

```powershell
cd backend
npm install
npm run migrate        # creates all tables (safe to run again)
npm run seed           # loads 30 titles + physical copies (safe to run again)
npm run db:verify      # prints PASS/FAIL checks against the real database
```

Other commands: `npm run migrate:status`, `npm run db:create`.

## 4. Start the backend

```powershell
cd backend
npm run dev            # http://localhost:5000
```

Check it: open http://localhost:5000/api/health. It reports the PostgreSQL version it is connected to.
If it stops with "JWT_SECRET is missing", see step 2.

## 5. Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev            # http://localhost:5173
```

Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`, and keep the backend running).
You land on the sign-in screen. Click **Create an account**, sign up, then sign in.

What works in Phase 2:

- Sign up (full name, username, email, phone, password + confirmation), sign in with username **or** email, sign out.
- Profile page: change full name, email and phone (the username is permanent) and change your password.
- Changing your password signs you out on every other device. Several devices can be signed in at once.
- Sessions end after 30 minutes without activity. Signing in again returns you to the page you were on.
- `/dashboard` and `/profile` need a sign-in; the dashboard is a placeholder until Phase 3.

## Tests

```powershell
cd backend
npm test        # 49 API tests: signup, login, sessions, timeout, CSRF, rate limits, profile, passwords
```

The tests use the real database. They create temporary users named `zz_test_*` and delete them afterwards.
They do not touch real accounts or the seeded catalogue.

## Security notes (Phase 2)

- Passwords are hashed with bcrypt. Hashes never leave the server.
- Login uses a signed JWT in an HTTP-only, SameSite=Lax cookie (JavaScript cannot read it). The cookie is
  marked Secure automatically when `NODE_ENV=production`.
- State-changing requests need a CSRF token (double-submit cookie) and an allowed `Origin`.
- Failed logins are rate limited (5 per account and 20 per IP per 15 minutes); sign-ups are limited to 10 per
  hour per IP; password-change guesses to 5 per 15 minutes. Counters are in memory and reset when the
  backend restarts.
- The 30-minute inactivity rule is enforced by the server from `auth_sessions.last_activity_at`, so it holds
  even if the browser is closed or the cookie is copied. A deactivated user's sessions stop working at once.
- Not included, by design: forgot-password/email reset, user deletion, profile pictures.

## Project structure

```
backend/
  src/config/env.js          environment loading + validation
  src/db/pool.js             pg connection pool, transaction helper
  src/db/migrate.js          SQL migration runner (checksummed, advisory-locked)
  src/db/migrations/*.sql    001 users/auth, 002 catalogue, 003 circulation, 004 events/notifications/config
  src/db/seeds/              idempotent seed + data/catalogue.js
  src/routes/                auth.js (signup, login, logout, me, heartbeat), profile.js
  src/middleware/            auth (authenticate, requireRole), csrf, rateLimiters, errorHandler
  src/services/              users, sessions (JWT + inactivity), passwords
  tests/                     API tests (node:test)
  scripts/                   create-db.js, verify-db.js
frontend/
  src/api.js                 fetch wrapper (cookies, CSRF header, error mapping)
  src/auth/AuthContext.jsx   session state, inactivity timer, heartbeat
  src/components/            ui (fields, buttons), Layouts (route guards, split-screen auth layout)
  src/pages/                 Login, Signup, Dashboard (placeholder), Profile
```

## Database notes

- **Tables:** roles, users, auth_sessions, genres, authors, books, book_copies, reservations,
  reservation_holds, issues, fines, fine_adjustments, transaction_events, notifications, system_config.
- **Copy statuses:** AVAILABLE, ISSUED, ON_HOLD, UNDER_INSPECTION, DAMAGED, LOST, WITHDRAWN.
  `ON_HOLD` is reserved for the reservations phase.
- **Enforced by the database:** one active issue per copy; one active reservation per user and title;
  one open hold per copy; an issue's book must match its copy; usernames cannot change;
  `transaction_events` rejects UPDATE, DELETE and TRUNCATE; notification dedupe keys are unique per user.
- **Migrations:** never edit an applied migration (the runner detects it). Add a new numbered file.

## Seed data notes

- 30 titles, about 107 physical copies, 12 genres, copy IDs like `ATOM001`.
- All ISBNs are demo identifiers (`DEMO-ISBN-0001` ...), flagged `isbn_is_demo = true`.
- Page counts are approximate demo values. Covers are not seeded (`cover_url` is empty); the app shows a
  generated placeholder cover for every title until real cover URLs are added.
- Copies shown as ISSUED are held by 8 inactive `seed_borrower_*` accounts that cannot log in.
  Their due dates are 1 to 12 days after the day you first seed, so they become overdue later.
  Later phases must ignore inactive accounts when sending reminders.
- Re-running the seed never overwrites live data (copy statuses, config changes).
- `library_timezone` in `system_config` is `Asia/Kolkata` (set by migration `005`, only while it was still unset).

## Phase 3: dashboard and catalogue

After pulling Phase 3, apply the one new migration (it only adds two nullable columns and sets the
timezone; no data is reset):

```powershell
cd backend
npm run migrate
npm test
```

New API endpoints (all need a signed-in session, all read-only):

| Endpoint | Purpose |
|---|---|
| `GET /api/dashboard/summary` | Borrowed count, free slots of 5, upcoming due dates, outstanding fines. |
| `GET /api/catalogue/recommendations` | Exactly 20 distinct titles in sections (featured, popular, recent, more). |
| `GET /api/catalogue/books` | Search by title or ISBN. Filters `genreId`, `authorId`; sort `title`, `author`, `recent`; `page`, `pageSize`. Only titles with an AVAILABLE copy. |
| `GET /api/catalogue/filters` | Genres and authors for the filter drop-downs. |
| `GET /api/catalogue/books/:id` | Full details and copy availability for one title. |

Not built yet, on purpose: actual issuing (Phase 4), My Books / returns / renewals (Phase 5),
reservations (Phase 6), notifications (Phase 7). The Issue Book page and the sidebar pages for those
phases say so on screen and do not fake any result.

## Phase 4: issuing books and My Books

No migration is needed. Run `npm test` in `backend` to check it.

| Endpoint | Purpose |
|---|---|
| `POST /api/issues` | Issue one book (`{ "bookId": 12 }`). Re-checks every rule inside one locked transaction. |
| `GET /api/issues/eligibility?bookId=12` | Read-only preview used to prefill the Issue Book page. Not authoritative. |
| `GET /api/issues/mine` | The signed-in member's active loans and borrowing history. |

Rules enforced by the server: account active, title not archived, no overdue active issue, fewer than 5
active issues, and an AVAILABLE physical copy. A successful issue assigns the lowest-numbered AVAILABLE
copy, sets it to ISSUED, creates the issue (due in 14 calendar days, library timezone), writes an
immutable `BOOK_ISSUED` event and an `ISSUE_SUCCESS` notification row, all in one transaction.

The automated tests create throw-away titles (copy prefix `ZZT...`) and members (`zz_test_...`) and remove
them afterwards. To remove the events those test members created, the cleanup step briefly switches off the
event-immutability trigger inside a single transaction and only deletes events belonging to those test
accounts and test titles. Real members' events are never touched.

Not built yet, on purpose: returns, renewals and fine collection (Phase 5), reservations (Phase 6),
notification screens (Phase 7).

## Troubleshooting

| Problem | Fix |
|---|---|
| `Missing required environment variables` | Create `backend/.env` from `.env.example`. |
| `password authentication failed` | Check `DB_USER` / `DB_PASSWORD` in `.env` match pgAdmin. |
| `database "libtrack" does not exist` | Create it (step 1) or run `npm run db:create`. |
| `connect ECONNREFUSED` | Start the service: `Start-Service postgresql-x64-18` (admin PowerShell). Check `DB_PORT`. |
| `permission denied for schema public` | Connect as the database owner, or run `GRANT ALL ON SCHEMA public TO libtrack_app;` as `postgres` while connected to `libtrack`. |
| `Migration ... was changed after it was applied` | Restore the original file and add a new migration instead. |
| `JWT_SECRET is missing or too short` | Generate one (step 2) and add it to `backend/.env`. |
| "Request origin is not allowed" or "Security check failed" | Open the app at `http://localhost:5173` exactly (not `127.0.0.1`), or list your origin in `CLIENT_ORIGIN`. |
| Frontend says port 5173 is in use | Close the other program using it. The frontend deliberately will not switch ports (the backend only accepts the `CLIENT_ORIGIN` origin). |
| "Too many failed sign-in attempts" | Wait 15 minutes or restart the backend (counters are in memory). |
| Backend port 5000 already in use | Change `PORT` in `backend/.env` and the proxy `target` in `frontend/vite.config.js`. |
