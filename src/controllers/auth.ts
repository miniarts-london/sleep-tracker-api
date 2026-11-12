import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.ts';
import { TOKEN_LIFETIME_SECONDS, signToken } from '../auth/tokens.ts';
import {
  type FieldError,
  RULES,
  fail,
  fieldError,
  isName,
  isPassword,
  isUserId,
  succeed,
} from './validation.ts';

// bcrypt "cost": the hash is repeated 2^12 times. Each hash takes a fraction
// of a second, which is fine for one login but makes guessing millions of
// passwords from a leaked table far too slow.
const BCRYPT_COST = 12;

// A real bcrypt hash of a random password nobody knows. When a username
// doesn't exist, we still compare against this, so a missing user takes as
// long to answer as a wrong password. Otherwise the response time would
// reveal which usernames exist.
const DUMMY_HASH = '$2b$12$UJleVhqCLGp2t7uSGhLcoOs6sQPrYTIOQNfxZJjMutd0gFCGUGcqG';

// The same answer for "no such user" and "wrong password", for the same reason.
const INVALID_LOGIN = { error: 'Invalid username or password' };

const USERNAME_TAKEN: FieldError = { fieldName: 'username', message: 'Username is already taken' };

// POST /api/auth/register
// Body: { username, password, first_name, last_name }
export async function register(req: Request, res: Response) {
  const b = (req.body ?? {}) as Record<string, unknown>;

  const errors: FieldError[] = [];
  if (!isUserId(b.username)) errors.push(fieldError('username', RULES.userId));
  if (!isPassword(b.password)) errors.push(fieldError('password', RULES.password));
  if (!isName(b.first_name)) errors.push(fieldError('first_name', RULES.name));
  if (!isName(b.last_name)) errors.push(fieldError('last_name', RULES.name));
  if (errors.length > 0) {
    fail(res, 400, errors);
    return;
  }

  const { username, password, first_name, last_name } = b as Record<string, string>;

  // Never store the password itself, only its hash. bcrypt adds a random
  // "salt", so two people with the same password get different hashes.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    await pool.query(
      `INSERT INTO users (username, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4)`,
      [username, passwordHash, first_name.trim(), last_name.trim()],
    );
    succeed(res, 201);
  } catch (err) {
    // 23505 = Postgres "unique violation": the username column is UNIQUE.
    // We let the database check this, rather than SELECT first, so two
    // sign-ups at the same moment can't both get through.
    if ((err as { code?: string }).code === '23505') {
      fail(res, 409, [USERNAME_TAKEN]);
      return;
    }
    throw err; // anything else goes to the central error handler
  }
}

// POST /api/auth/login
// Body: { username, password }. Returns { token, expires_in, first_name, last_name }.
export async function login(req: Request, res: Response) {
  const b = (req.body ?? {}) as Record<string, unknown>;

  // Only check that both are present text. The full rules are for creating
  // an account; here a bad value just means "wrong login".
  const errors: FieldError[] = [];
  if (typeof b.username !== 'string' || b.username === '') {
    errors.push({ fieldName: 'username', message: 'username is required' });
  }
  if (typeof b.password !== 'string' || b.password === '') {
    errors.push({ fieldName: 'password', message: 'password is required' });
  }
  if (errors.length > 0) {
    fail(res, 400, errors);
    return;
  }

  const username = b.username as string;
  const password = b.password as string;

  const result = await pool.query<{
    username: string;
    password_hash: string;
    first_name: string;
    last_name: string;
  }>(
    'SELECT username, password_hash, first_name, last_name FROM users WHERE username = $1',
    [username],
  );
  const user = result.rows[0];

  // Always run one bcrypt comparison, real or dummy (see DUMMY_HASH).
  const passwordOk = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    res.status(401).json(INVALID_LOGIN);
    return;
  }

  // The names let the front end pre-fill forms (the token only holds the
  // username). They're only sent after the password check passed, so a
  // failed login still reveals nothing.
  res.json({
    token: signToken(user.username),
    expires_in: TOKEN_LIFETIME_SECONDS,
    first_name: user.first_name,
    last_name: user.last_name,
  });
}
