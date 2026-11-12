-- 001: shared helpers, roles, users, authentication sessions

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE roles (
  id          SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE CHECK (name = upper(name)),
  description TEXT
);

CREATE TABLE users (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name           TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 100),
  username            TEXT NOT NULL CHECK (username ~ '^[A-Za-z0-9_.]{3,30}$'),
  email               TEXT NOT NULL CHECK (position('@' IN email) > 1),
  phone               TEXT,
  password_hash       TEXT NOT NULL,
  role_id             SMALLINT NOT NULL REFERENCES roles (id),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness for login identifiers.
CREATE UNIQUE INDEX users_username_lower_uq ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));
CREATE INDEX users_role_idx ON users (role_id);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Business rule: a username is permanent once created.
CREATE OR REPLACE FUNCTION prevent_username_change() RETURNS trigger AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'username is permanent and cannot be changed (user id %)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_username_permanent
  BEFORE UPDATE OF username ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_username_change();

-- One row per login session. The inactivity timeout is enforced from last_activity_at.
CREATE TABLE auth_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          BIGINT NOT NULL REFERENCES users (id),
  user_agent       TEXT,
  ip_address       INET,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  revoked_reason   TEXT
);

CREATE INDEX auth_sessions_active_user_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_last_activity_idx ON auth_sessions (last_activity_at) WHERE revoked_at IS NULL;
