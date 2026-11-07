-- Changes sleeper.user_id from integer to text, for tables created before
-- schema.sql was updated. Existing ids are kept: 1 becomes '1'.
-- Safe to run more than once. Run it in Neon's SQL Editor, or locally with:
--   psql -d Tracker -f src/db/migrations/001-user-id-text.sql
BEGIN;

-- The old rule (user_id > 0) only makes sense for numbers, so drop it first.
ALTER TABLE sleeper DROP CONSTRAINT IF EXISTS sleeper_user_id_check;

-- USING tells Postgres how to convert each existing value.
ALTER TABLE sleeper ALTER COLUMN user_id TYPE text USING user_id::text;

-- The new rule, same as the API: 1 to 50 letters, numbers, - or _.
ALTER TABLE sleeper ADD CONSTRAINT sleeper_user_id_check
  CHECK (user_id ~ '^[A-Za-z0-9_-]{1,50}$');

COMMIT;
