import type { RequestHandler } from 'express';

// CORS: browsers block a web page from reading a response from a different
// address (origin) unless the server says that origin is allowed. curl and
// Postman don't check this; only browsers do.
//
// Allowed origins come from CORS_ORIGINS, a comma-separated list, e.g.
//   CORS_ORIGINS=https://my-app.vercel.app,https://example.com
// Any http://localhost:<port> is always allowed, for local front-end dev.

const LOCALHOST = /^http:\/\/localhost(:\d+)?$/;

function isAllowed(origin: string): boolean {
  if (LOCALHOST.test(origin)) return true;
  const allowed = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, '')) // ignore a trailing slash
    .filter(Boolean);
  return allowed.includes(origin);
}

export const cors: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;

  // The answer depends on who's asking, so caches must keep one per origin.
  res.vary('Origin');

  if (origin && isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  // The "preflight": before a POST with JSON, the browser sends OPTIONS to
  // ask permission. Answer it here with no body; the headers are the answer.
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
};
