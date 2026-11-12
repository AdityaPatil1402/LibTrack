-- 002: genres, authors, books (titles) and physical copies

CREATE TABLE genres (
  id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE authors (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE books (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title            TEXT NOT NULL,
  author_id        BIGINT NOT NULL REFERENCES authors (id),
  genre_id         SMALLINT NOT NULL REFERENCES genres (id),
  isbn             TEXT NOT NULL UNIQUE,
  isbn_is_demo     BOOLEAN NOT NULL DEFAULT FALSE,
  description      TEXT NOT NULL,
  publication_year SMALLINT CHECK (publication_year BETWEEN 1000 AND 2100),
  page_count       INTEGER CHECK (page_count > 0),
  language         TEXT NOT NULL DEFAULT 'English',
  cover_url        TEXT,
  copy_code_prefix TEXT NOT NULL UNIQUE CHECK (copy_code_prefix ~ '^[A-Z0-9]{3,8}$'),
  is_curated       BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived      BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((is_archived AND archived_at IS NOT NULL) OR (NOT is_archived AND archived_at IS NULL))
);

CREATE UNIQUE INDEX books_title_author_uq ON books (lower(title), author_id);
CREATE INDEX books_author_idx ON books (author_id);
CREATE INDEX books_genre_idx ON books (genre_id);
CREATE INDEX books_created_at_idx ON books (created_at DESC);

CREATE TRIGGER books_set_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ON_HOLD is used from the reservations phase: a copy held for a waiting user.
CREATE TABLE book_copies (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  book_id           BIGINT NOT NULL REFERENCES books (id),
  copy_code         TEXT NOT NULL UNIQUE CHECK (copy_code ~ '^[A-Z0-9]{3,8}[0-9]{3}$'),
  status            TEXT NOT NULL DEFAULT 'AVAILABLE'
                    CHECK (status IN ('AVAILABLE', 'ISSUED', 'ON_HOLD', 'UNDER_INSPECTION', 'DAMAGED', 'LOST', 'WITHDRAWN')),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  condition_notes   TEXT,
  acquired_on       DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Lets other tables reference (copy, book) together so they can never disagree.
  UNIQUE (id, book_id)
);

CREATE INDEX book_copies_book_status_idx ON book_copies (book_id, status);

CREATE TRIGGER book_copies_set_updated_at
  BEFORE UPDATE ON book_copies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Keep status_changed_at accurate whenever the status actually changes.
CREATE OR REPLACE FUNCTION touch_copy_status_changed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER book_copies_status_changed
  BEFORE UPDATE OF status ON book_copies
  FOR EACH ROW EXECUTE FUNCTION touch_copy_status_changed_at();
