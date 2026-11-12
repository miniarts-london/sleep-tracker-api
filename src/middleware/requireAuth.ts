import type { RequestHandler, Response } from 'express';
import { verifyToken } from '../auth/tokens.ts';

// Put this before any handler that needs a logged-in user, e.g.
//   router.get('/entries', requireAuth, listEntries)
// Express runs them left to right. requireAuth either calls next() to let
// the request through, or answers 401 itself and the handler never runs.
//
// The client sends its token in a header:
//   Authorization: Bearer eyJhbGciOi...
// "Bearer" means "whoever holds (bears) this token is allowed in".
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    unauthorized(res, 'Missing or malformed Authorization header');
    return;
  }

  let username: string;
  try {
    username = verifyToken(token);
  } catch (err) {
    // A missing JWT_SECRET is our fault, not the client's: let the central
    // error handler turn it into a 500 instead of pretending it's a bad token.
    if (err instanceof Error && err.message.startsWith('JWT_SECRET')) throw err;
    unauthorized(res, 'Invalid or expired token');
    return;
  }

  // res.locals is Express's place for data that lives for this one request.
  // The handler reads it with currentUsername(res).
  res.locals.username = username;
  next();
};

// 401 = "we don't know who you are". The WWW-Authenticate header tells the
// client which kind of credentials to send (a standard part of 401).
function unauthorized(res: Response, message: string) {
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({ error: message });
}

// The logged-in user's username, for handlers behind requireAuth.
export function currentUsername(res: Response): string {
  const username: unknown = res.locals.username;
  if (typeof username !== 'string') {
    // Only happens if a route forgot requireAuth: a bug, so a 500.
    throw new Error('currentUsername() used on a route without requireAuth');
  }
  return username;
}
