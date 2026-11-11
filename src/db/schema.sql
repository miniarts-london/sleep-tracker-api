-- Safe to run more than once: IF NOT EXISTS skips it if the table is already there.
CREATE TABLE IF NOT EXISTS sleeper (
  -- The entry's own id, created by the database: 1, 2, 3, ...
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The person's id, sent by the client as text, e.g. 'kaori'.
  -- One person has many entries. Same rule as the API's validation.
  user_id     text    NOT NULL CHECK (user_id ~ '^[A-Za-z0-9_-]{1,50}$'),
  first_name  text    NOT NULL,
  last_name   text    NOT NULL,
  -- Hours slept. 'real' comes back to Node as a number; halves like 7.5 are
  -- stored exactly. The CHECK is a safety net: 1 to 24, in steps of 0.5.
  sleep_time  real    NOT NULL
              CHECK (sleep_time BETWEEN 1 AND 24 AND sleep_time * 2 = floor(sleep_time * 2)),
  date        date    NOT NULL,
  -- No duplicates: one entry per person per date.
  UNIQUE (user_id, date)
);

-- People who can log in. A user's username is the user_id on their entries.
CREATE TABLE IF NOT EXISTS users (
  id             integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Same rule as sleeper.user_id. UNIQUE: no two people share a username.
  username       text        NOT NULL UNIQUE CHECK (username ~ '^[A-Za-z0-9_-]{1,50}$'),
  -- Never the password itself: a one-way scrambled version (scrypt) plus
  -- its random salt, so a leaked table doesn't reveal anyone's password.
  password_hash  text        NOT NULL,
  first_name     text        NOT NULL,
  last_name      text        NOT NULL,
  -- Filled in by the database when the row is created.
  created_at     timestamptz NOT NULL DEFAULT now()
);
