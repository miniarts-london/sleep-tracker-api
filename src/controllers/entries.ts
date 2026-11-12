import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';
import { currentUsername } from '../middleware/requireAuth.ts';
import {
  type FieldError,
  RULES,
  fail,
  fieldError,
  isName,
  isUserId,
  isValidDate,
  succeed,
} from './validation.ts';

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

// One row from GET /api/entries: a user and how many entries they have.
type UserSummaryRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  count: string; // Postgres sends COUNT as text, since it can exceed JS numbers
};

function toUserSummary(row: UserSummaryRow) {
  return { ...row, count: Number(row.count) };
}

// No user_id here: it comes from the login token, not the body.
function validateEntry(body: unknown): FieldError[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];

  if (!isName(b.first_name)) errors.push(fieldError('first_name', RULES.name));
  if (!isName(b.last_name)) errors.push(fieldError('last_name', RULES.name));

  const s = b.sleep_time;
  if (typeof s !== 'number' || s < 1 || s > 24 || !Number.isInteger(s * 2)) {
    errors.push(fieldError('sleep_time', RULES.sleepTime));
  }

  if (!isValidDate(b.date)) errors.push(fieldError('date', RULES.date));

  return errors;
}

// A duplicate is reported against 'date': changing the date fixes it.
const DUPLICATE: FieldError = {
  fieldName: 'date',
  message: 'An entry for this user and date already exists',
};

// 403 = "we know who you are, but this isn't yours". (401 means "we don't
// know who you are", and requireAuth handles that before we get here.)
// Returns true if it sent the 403, so the handler should stop.
function forbidOtherUsers(res: Response, userId: string): boolean {
  if (userId === currentUsername(res)) return false;
  res.status(403).json({ error: 'You can only view your own entries' });
  return true;
}

// ---------- handlers ----------
// These are async. In Express 5, if a query throws, the error goes to the
// central error handler automatically, so there's no try/catch for that.
// All of them sit behind requireAuth (see routes/entries.ts).

// POST /api/entries
// The entry always belongs to the logged-in user. Any user_id in the body is
// ignored, so nobody can log sleep under someone else's name.
export async function createEntry(req: Request, res: Response) {
  const errors = validateEntry(req.body);
  if (errors.length > 0) {
    fail(res, 400, errors);
    return;
  }

  const user_id = currentUsername(res);
  const { first_name, last_name, sleep_time, date } = req.body;

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
// One row per user (id and name) with how many entries they have, sorted by
// user_id. No user input, so nothing to validate and no query parameters.
export async function listEntries(_req: Request, res: Response) {
  const result = await pool.query<UserSummaryRow>(
    `SELECT user_id, first_name, last_name, COUNT(user_id) FROM public."sleeper" 
    GROUP BY user_id, first_name, last_name
    ORDER BY user_id`
  );
  res.json(result.rows.map(toUserSummary));
}

// GET /api/users/:userId/entries
export async function listUserEntries(req: Request, res: Response) {
  const { userId } = req.params;
  if (!isUserId(userId)) {
    fail(res, 400, [fieldError('userId', RULES.userId)]);
    return;
  }
  //everyone can see the list of entries for any user, but only the user themselves can see the details of a specific entry. So we don't forbid other users here, but we do in getUserEntry() below.
  // if (forbidOtherUsers(res, userId)) return;

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
  // isUserId() above already proved this is a string, but TypeScript can't
  // follow that through the errors list, so we tell it with "as string".
  if (forbidOtherUsers(res, userId as string)) return;

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
