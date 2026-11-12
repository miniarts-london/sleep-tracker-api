// Creates the tables from schema.sql. Run with: npm run db:setup
// Safe to re-run: tables that already exist are left as they are.
import { readFile } from 'node:fs/promises';
import { pool } from './pool.ts';

const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');

try {
  const { rows } = await pool.query('SELECT current_database() AS name');
  console.log(`Connected to database "${rows[0].name}"`);

  await pool.query(schema);
  console.log('Tables sleeper and users are ready');
} finally {
  // Close the pool so the script can exit.
  await pool.end();
}
