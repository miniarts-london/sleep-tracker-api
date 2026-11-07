import pg from 'pg';

// The connection string comes only from the environment, never from code.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
}

// A pool keeps a few connections open and reuses them, so each request
// doesn't have to open a new one. SSL is turned on by `sslmode=require`
// in the connection string.
export const pool = new pg.Pool({ connectionString });
