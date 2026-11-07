-- Safe to run more than once: IF NOT EXISTS skips it if the table is already there.
CREATE TABLE IF NOT EXISTS sleeper (
  -- The entry's own id, created by the database: 1, 2, 3, ...
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The person's id, sent by the client. One person has many entries.
  user_id     integer NOT NULL CHECK (user_id > 0),
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
