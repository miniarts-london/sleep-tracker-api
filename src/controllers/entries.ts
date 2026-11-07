import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';

// The columns we read back. We list them by name rather than SELECT *,
// so the response shape doesn't change if the table gains columns later.
const COLUMNS = 'user_id, first_name, last_name, sleep_time, date';

type EntryRow = {
  user_id: number;
  first_name: string;
  last_name: string;
  sleep_time: number | string; // a string if the column type is numeric
  date: string;
};

function toEntry(row: EntryRow) {
  return { ...row, sleep_time: Number(row.sleep_time) };
}

// ---------- validation helpers ----------

const MAX_INT = 2_147_483_647; // largest value a Postgres integer can hold

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_INT;
}

// Path params always arrive as text, e.g. '42'.
function parseUserId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return id <= MAX_INT ? id : null;
}

// A real calendar date in YYYY-MM-DD format. '2026-02-30' fails because
// JavaScript rolls it over to March, so it no longer matches what was sent.
function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 50;
}

function validateEntry(body: unknown): string[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isPositiveInt(b.user_id)) errors.push('user_id must be a positive whole number');
  if (!isName(b.first_name)) errors.push('first_name must be text, 1 to 50 characters');
  if (!isName(b.last_name)) errors.push('last_name must be text, 1 to 50 characters');

  const s = b.sleep_time;
  if (typeof s !== 'number' || s < 1 || s > 24 || !Number.isInteger(s * 2)) {
    errors.push('sleep_time must be a number from 1 to 24, in steps of 0.5');
  }

  if (!isValidDate(b.date)) errors.push('date must be a real date in YYYY-MM-DD format');

  return errors;
}

// ---------- handlers ----------
// These are async. In Express 5, if a query throws, the error goes to the
// central error handler automatically, so there's no try/catch for that.

// POST /api/entries
export async function createEntry(req: Request, res: Response) {
  const errors = validateEntry(req.body);
  if (errors.length > 0) {
    res.status(400).json({ error: 'Invalid entry', details: errors });
    return;
  }

  const { user_id, first_name, last_name, sleep_time, date } = req.body;

  // No duplicates: one entry per person per date.
  const existing = await pool.query(
    'SELECT 1 FROM sleeper WHERE user_id = $1 AND date = $2',
    [user_id, date],
  );
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'An entry for this user and date already exists' });
    return;
  }

  try {
    const result = await pool.query<EntryRow>(
      `INSERT INTO sleeper (user_id, first_name, last_name, sleep_time, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${COLUMNS}`,
      [user_id, first_name.trim(), last_name.trim(), sleep_time, date],
    );
    res.status(201).json(toEntry(result.rows[0]));
  } catch (err) {
    // 23505 = Postgres "unique violation": two identical requests arrived at
    // the same moment and the table's UNIQUE rule caught the second one.
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'An entry for this user and date already exists' });
      return;
    }
    throw err; // anything else goes to the central error handler
  }
}

// GET /api/entries
// Every entry for every user, newest first. No user input, so nothing to
// validate and no query parameters needed.
export async function listEntries(_req: Request, res: Response) {
  const result = await pool.query<EntryRow>(
    `SELECT ${COLUMNS} FROM sleeper ORDER BY date DESC, user_id`,
  );
  res.json(result.rows.map(toEntry));
}

// GET /api/users/:userId/entries
export async function listUserEntries(req: Request, res: Response) {
  const userId = parseUserId(req.params.userId);
  if (userId === null) {
    res.status(400).json({ error: 'userId must be a positive whole number' });
    return;
  }

  const result = await pool.query<EntryRow>(
    `SELECT ${COLUMNS} FROM sleeper WHERE user_id = $1 ORDER BY date DESC`,
    [userId],
  );
  // No entries is still a successful answer: an empty list, not a 404.
  res.json(result.rows.map(toEntry));
}

// GET /api/users/:userId/entries/:date
export async function getUserEntry(req: Request, res: Response) {
  const userId = parseUserId(req.params.userId);
  const { date } = req.params;

  const errors: string[] = [];
  if (userId === null) errors.push('userId must be a positive whole number');
  if (!isValidDate(date)) errors.push('date must be a real date in YYYY-MM-DD format');
  if (errors.length > 0) {
    res.status(400).json({ error: 'Invalid request', details: errors });
    return;
  }

  const result = await pool.query<EntryRow>(
    `SELECT ${COLUMNS} FROM sleeper WHERE user_id = $1 AND date = $2`,
    [userId, date],
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Entry not found' });
    return;
  }
  res.json(toEntry(result.rows[0]));
}
