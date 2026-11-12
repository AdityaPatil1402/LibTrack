-- 005: Phase 3. Publisher and edition for the full book-details page, and the confirmed library timezone.

ALTER TABLE books ADD COLUMN publisher TEXT;
ALTER TABLE books ADD COLUMN edition   TEXT;

-- The owner confirmed the library is in India. Only fills the value while it is still unset,
-- so a value someone has deliberately changed is never overwritten.
UPDATE system_config
   SET value = '"Asia/Kolkata"'::jsonb,
       description = 'Library timezone (IANA name). All due-date, fine and reminder calendar logic uses it.'
 WHERE key = 'library_timezone'
   AND value = 'null'::jsonb;
