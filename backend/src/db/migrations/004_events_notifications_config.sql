-- 004: immutable transaction events, notifications, system configuration

CREATE TABLE transaction_events (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'BOOK_ISSUED', 'BOOK_RETURNED', 'BOOK_RENEWED', 'BOOK_LOST',
                      'RESERVATION_CREATED', 'RESERVATION_READY', 'RESERVATION_FULFILLED',
                      'RESERVATION_CANCELLED', 'RESERVATION_EXPIRED', 'RESERVATION_TERMINATED',
                      'COPY_STATUS_CHANGED', 'COPY_INSPECTED',
                      'FINE_ASSESSED', 'FINE_ADJUSTED')),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id           BIGINT REFERENCES users (id),
  actor_user_id     BIGINT REFERENCES users (id),
  book_id           BIGINT REFERENCES books (id),
  copy_id           BIGINT REFERENCES book_copies (id),
  issue_id          BIGINT REFERENCES issues (id),
  reservation_id    BIGINT REFERENCES reservations (id),
  previous_state    JSONB,
  new_state         JSONB,
  reason            TEXT,
  -- A correction is a NEW event pointing at the event it corrects.
  corrects_event_id BIGINT REFERENCES transaction_events (id)
);

CREATE INDEX transaction_events_user_idx ON transaction_events (user_id, occurred_at DESC);
CREATE INDEX transaction_events_book_idx ON transaction_events (book_id);
CREATE INDEX transaction_events_copy_idx ON transaction_events (copy_id);
CREATE INDEX transaction_events_issue_idx ON transaction_events (issue_id);
CREATE INDEX transaction_events_reservation_idx ON transaction_events (reservation_id);
CREATE INDEX transaction_events_type_idx ON transaction_events (event_type);

-- Events are immutable: no edits, deletes or truncation, ever.
CREATE OR REPLACE FUNCTION reject_event_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transaction_events is immutable: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_events_no_update_delete
  BEFORE UPDATE OR DELETE ON transaction_events
  FOR EACH ROW EXECUTE FUNCTION reject_event_changes();

CREATE TRIGGER transaction_events_no_truncate
  BEFORE TRUNCATE ON transaction_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_event_changes();

CREATE TABLE notifications (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users (id),
  type           TEXT NOT NULL CHECK (type IN (
                   'ISSUE_SUCCESS', 'DUE_REMINDER_3D', 'DUE_REMINDER_1D', 'OVERDUE',
                   'RENEWAL_SUCCESS', 'RETURN_SUCCESS', 'RETURN_AWAITING_INSPECTION',
                   'RESERVATION_FRONT_OF_QUEUE', 'RESERVATION_HOLD_STARTED', 'RESERVATION_HOLD_EXPIRED',
                   'RESERVATION_CANCELLED', 'RESERVATION_TERMINATED')),
  title          TEXT NOT NULL,
  message        TEXT NOT NULL,
  book_id        BIGINT REFERENCES books (id),
  issue_id       BIGINT REFERENCES issues (id),
  reservation_id BIGINT REFERENCES reservations (id),
  -- Prevents duplicate notifications: the same key can exist only once per user.
  dedupe_key     TEXT NOT NULL,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key),
  CHECK (is_read = (read_at IS NOT NULL))
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE NOT is_read;

CREATE TABLE system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER system_config_set_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
