import pg from 'pg';

// The connection string comes only from the environment, never from code.
// Vercel's database env files often name it POSTGRES_URL instead.
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'No database connection string. Set DATABASE_URL (or POSTGRES_URL) in .env or .env.local.',
  );
}

// Return DATE columns as plain 'YYYY-MM-DD' text. By default pg turns them
// into JavaScript Dates at local midnight, which can shift to the day before
// when sent as JSON. 1082 is Postgres's internal id for the DATE type.
pg.types.setTypeParser(1082, (value) => value);

// A pool keeps a few connections open and reuses them, so each request
// doesn't have to open a new one. SSL is turned on by `sslmode=require`
// in the connection string.
export const pool = new pg.Pool({ connectionString });
