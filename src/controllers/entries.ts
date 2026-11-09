import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';

// The columns we read back. We list them by name rather than SELECT *,
// so the response shape doesn't change if the table gains columns later.
const COLUMNS = 'user_id, first_name, last_name, sleep_time, date';

type EntryRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  sleep_time: number | string; // a string if the column type is numeric
  date: string;
};

function toEntry(row: EntryRow) {
  return { ...row, sleep_time: Number(row.sleep_time) };
}

// ---------- validation helpers ----------

// One validation problem. fieldName matches the name the client used
// (a JSON key like 'user_id', or a URL part like 'userId'), so a front-end
// can show each message next to the right input.
type FieldError = { fieldName: string; message: string };

function fieldError(fieldName: string, rule: string): FieldError {
  return { fieldName, message: `${fieldName} ${rule}` };
}

// The rules, without a field name, so body and URL errors can share them.
const RULES = {
  userId: 'must be 1 to 50 letters, numbers, - or _',
  name: 'must be text, 1 to 50 characters',
  sleepTime: 'must be a number from 1 to 24, in steps of 0.5',
  date: 'must be a real date in YYYY-MM-DD format',
};

// user_id is text, e.g. 'kaori' or 'user-42'. Only letters, numbers, - and _
// because it also appears in URLs (/api/users/kaori/entries), where spaces
// or slashes would break things. The same rule is in schema.sql.
const USER_ID = /^[A-Za-z0-9_-]{1,50}$/;

// Works for both the JSON body and the URL path param.
function isUserId(value: unknown): value is string {
  return typeof value === 'string' && USER_ID.test(value);
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

function validateEntry(body: unknown): FieldError[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];

  if (!isUserId(b.user_id)) errors.push(fieldError('user_id', RULES.userId));
  if (!isName(b.first_name)) errors.push(fieldError('first_name', RULES.name));
  if (!isName(b.last_name)) errors.push(fieldError('last_name', RULES.name));

  const s = b.sleep_time;
  if (typeof s !== 'number' || s < 1 || s > 24 || !Number.isInteger(s * 2)) {
    errors.push(fieldError('sleep_time', RULES.sleepTime));
  }

  if (!isValidDate(b.date)) errors.push(fieldError('date', RULES.date));

  return errors;
}

// ---------- response helpers ----------
// Submissions and validation failures share one shape:
//   { success: true,  details: null }
//   { success: false, details: [{ fieldName, message }, ...] }

function succeed(res: Response, status: number) {
  res.status(status).json({ success: true, details: null });
}

function fail(res: Response, status: number, details: FieldError[]) {
  res.status(status).json({ success: false, details });
}

// A duplicate is reported against 'date': changing the date fixes it.
const DUPLICATE: FieldError = {
  fieldName: 'date',
  message: 'An entry for this user and date already exists',
};

// ---------- handlers ----------
// These are async. In Express 5, if a query throws, the error goes to the
// central error handler automatically, so there's no try/catch for that.

// POST /api/entries
export async function createEntry(req: Request, res: Response) {
  const errors = validateEntry(req.body);
  if (errors.length > 0) {
    fail(res, 400, errors);
    return;
  }

  const { user_id, first_name, last_name, sleep_time, date } = req.body;

  // No duplicates: one entry per person per date.
  const existing = await pool.query(
    'SELECT 1 FROM sleeper WHERE user_id = $1 AND date = $2',
    [user_id, date],
  );
  if (existing.rows.length > 0) {
    fail(res, 409, [DUPLICATE]);
    return;
  }

  try {
    await pool.query(
      `INSERT INTO sleeper (user_id, first_name, last_name, sleep_time, date)
       VALUES ($1, $2, $3, $4, $5)`,
      [user_id, first_name.trim(), last_name.trim(), sleep_time, date],
    );
    succeed(res, 201);
  } catch (err) {
    // 23505 = Postgres "unique violation": two identical requests arrived at
    // the same moment and the table's UNIQUE rule caught the second one.
    if ((err as { code?: string }).code === '23505') {
      fail(res, 409, [DUPLICATE]);
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
    `SELECT user_id, first_name, last_name, COUNT(user_id) FROM public."sleeper" 
    GROUP BY user_id, first_name, last_name
    ORDER BY user_id`
  );
  res.json(result.rows.map(toEntry));
}

// GET /api/users/:userId/entries
export async function listUserEntries(req: Request, res: Response) {
  const { userId } = req.params;
  if (!isUserId(userId)) {
    fail(res, 400, [fieldError('userId', RULES.userId)]);
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
  const { userId, date } = req.params;

  const errors: FieldError[] = [];
  if (!isUserId(userId)) errors.push(fieldError('userId', RULES.userId));
  if (!isValidDate(date)) errors.push(fieldError('date', RULES.date));
  if (errors.length > 0) {
    fail(res, 400, errors);
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
