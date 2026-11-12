-- 003: reservations, holds, issues, fines

CREATE TABLE reservations (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users (id),
  book_id           BIGINT NOT NULL REFERENCES books (id),
  status            TEXT NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING', 'READY_FOR_COLLECTION', 'FULFILLED', 'EXPIRED', 'CANCELLED', 'TERMINATED')),
  status_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A reservation is open exactly while it is WAITING or READY_FOR_COLLECTION.
  CHECK ((status IN ('WAITING', 'READY_FOR_COLLECTION')) = (closed_at IS NULL))
);

-- One active reservation per user per title.
CREATE UNIQUE INDEX reservations_one_active_per_user_book_uq
  ON reservations (user_id, book_id) WHERE status IN ('WAITING', 'READY_FOR_COLLECTION');
-- Strict first-come-first-served queue ordering.
CREATE INDEX reservations_queue_idx ON reservations (book_id, created_at, id) WHERE status = 'WAITING';
CREATE INDEX reservations_user_idx ON reservations (user_id, created_at DESC);

CREATE TRIGGER reservations_set_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE issues (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id               BIGINT NOT NULL REFERENCES users (id),
  book_id               BIGINT NOT NULL,
  copy_id               BIGINT NOT NULL,
  source_reservation_id BIGINT UNIQUE REFERENCES reservations (id),
  status                TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETURNED', 'LOST')),
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date              DATE NOT NULL,
  renewal_count         SMALLINT NOT NULL DEFAULT 0 CHECK (renewal_count BETWEEN 0 AND 1),
  renewed_at            TIMESTAMPTZ,
  returned_at           TIMESTAMPTZ,
  lost_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The copy must belong to the stated book.
  FOREIGN KEY (copy_id, book_id) REFERENCES book_copies (id, book_id),
  CHECK (
    (status = 'ACTIVE'   AND returned_at IS NULL AND lost_at IS NULL) OR
    (status = 'RETURNED' AND returned_at IS NOT NULL) OR
    (status = 'LOST'     AND lost_at IS NOT NULL)
  ),
  CHECK ((renewal_count = 0) = (renewed_at IS NULL))
);

-- A physical copy can have at most one active issue (prevents double assignment).
CREATE UNIQUE INDEX issues_one_active_per_copy_uq ON issues (copy_id) WHERE status = 'ACTIVE';
CREATE INDEX issues_user_status_idx ON issues (user_id, status);
CREATE INDEX issues_active_due_idx ON issues (due_date) WHERE status = 'ACTIVE';
CREATE INDEX issues_book_idx ON issues (book_id);

CREATE TRIGGER issues_set_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE reservation_holds (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES reservations (id),
  copy_id        BIGINT NOT NULL REFERENCES book_copies (id),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  released_at    TIMESTAMPTZ,
  outcome        TEXT CHECK (outcome IN ('CLAIMED', 'EXPIRED', 'CANCELLED', 'TERMINATED')),
  CHECK (expires_at > started_at),
  CHECK ((released_at IS NULL) = (outcome IS NULL))
);

-- At most one open hold per copy and per reservation.
CREATE UNIQUE INDEX holds_one_open_per_copy_uq ON reservation_holds (copy_id) WHERE released_at IS NULL;
CREATE UNIQUE INDEX holds_one_open_per_reservation_uq ON reservation_holds (reservation_id) WHERE released_at IS NULL;
CREATE INDEX holds_open_expiry_idx ON reservation_holds (expires_at) WHERE released_at IS NULL;

CREATE TABLE fines (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  issue_id          BIGINT NOT NULL UNIQUE REFERENCES issues (id),
  user_id           BIGINT NOT NULL REFERENCES users (id),
  rate_per_day_inr  NUMERIC(8, 2) NOT NULL CHECK (rate_per_day_inr >= 0),
  overdue_days      INTEGER NOT NULL DEFAULT 0 CHECK (overdue_days >= 0),
  amount_inr        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_inr >= 0),
  status            TEXT NOT NULL DEFAULT 'ACCRUING' CHECK (status IN ('ACCRUING', 'FINALIZED')),
  calculated_through DATE,
  finalized_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'FINALIZED') = (finalized_at IS NOT NULL))
);

CREATE INDEX fines_user_idx ON fines (user_id);

CREATE TRIGGER fines_set_updated_at
  BEFORE UPDATE ON fines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Adjustments are append-only corrections to a fine (a correction references the one it corrects).
CREATE TABLE fine_adjustments (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fine_id                BIGINT NOT NULL REFERENCES fines (id),
  amount_delta_inr       NUMERIC(10, 2) NOT NULL CHECK (amount_delta_inr <> 0),
  reason                 TEXT NOT NULL,
  adjusted_by_user_id    BIGINT REFERENCES users (id),
  corrects_adjustment_id BIGINT REFERENCES fine_adjustments (id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX fine_adjustments_fine_idx ON fine_adjustments (fine_id);
