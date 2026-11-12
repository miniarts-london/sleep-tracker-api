import type { Response } from 'express';

// Validation and response helpers shared by the controllers.

// One validation problem. fieldName matches the name the client used
// (a JSON key like 'user_id', or a URL part like 'userId'), so a front-end
// can show each message next to the right input.
export type FieldError = { fieldName: string; message: string };

export function fieldError(fieldName: string, rule: string): FieldError {
  return { fieldName, message: `${fieldName} ${rule}` };
}

// The rules, without a field name, so body and URL errors can share them.
export const RULES = {
  userId: 'must be 1 to 50 letters, numbers, - or _',
  name: 'must be text, 1 to 50 characters',
  sleepTime: 'must be a number from 1 to 24, in steps of 0.5',
  date: 'must be a real date in YYYY-MM-DD format',
  password: 'must be text, 8 to 72 characters',
};

// user_id is text, e.g. 'kaori' or 'user-42'. Only letters, numbers, - and _
// because it also appears in URLs (/api/users/kaori/entries), where spaces
// or slashes would break things. The same rule is in schema.sql, for both
// sleeper.user_id and users.username.
const USER_ID = /^[A-Za-z0-9_-]{1,50}$/;

// Works for both the JSON body and the URL path param.
export function isUserId(value: unknown): value is string {
  return typeof value === 'string' && USER_ID.test(value);
}

// A real calendar date in YYYY-MM-DD format. '2026-02-30' fails because
// JavaScript rolls it over to March, so it no longer matches what was sent.
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 50;
}

// bcrypt only looks at the first 72 BYTES of a password and silently ignores
// the rest. We check bytes, not characters, because an emoji or an accented
// letter can take 2 to 4 bytes. Longer passwords are rejected rather than
// quietly cut short.
export function isPassword(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72
  );
}

// ---------- response helpers ----------
// Submissions and validation failures share one shape:
//   { success: true,  details: null }
//   { success: false, details: [{ fieldName, message }, ...] }

export function succeed(res: Response, status: number) {
  res.status(status).json({ success: true, details: null });
}

export function fail(res: Response, status: number, details: FieldError[]) {
  res.status(status).json({ success: false, details });
}
