import type { RequestHandler } from 'express';

// CORS: browsers block a web page from reading a response from a different
// address (origin) unless the server says that origin is allowed. curl and
// Postman don't check this; only browsers do.
//
// Always allowed: any http://localhost:<port> (local front-end dev) and the
// sites in FRONTEND_ORIGINS below. More can be added without a code change
// through CORS_ORIGINS, a comma-separated list, e.g.
//   CORS_ORIGINS=https://my-app.vercel.app,https://example.com

const LOCALHOST = /^http:\/\/localhost(:\d+)?$/;

// Our own front-end. A public address, not a secret, so it can live in code.
const FRONTEND_ORIGINS = ['https://sleep-tracker-ruddy.vercel.app'];

function isAllowed(origin: string): boolean {
  if (LOCALHOST.test(origin)) return true;
  if (FRONTEND_ORIGINS.includes(origin)) return true;
  const extra = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, '')) // ignore a trailing slash
    .filter(Boolean);
  return extra.includes(origin);
}

export const cors: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;

  // The answer depends on who's asking, so caches must keep one per origin.
  res.vary('Origin');

  if (origin && isAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // Authorization carries the login token. Browsers only let a page send
    // headers that are listed here.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // The "preflight": before a POST with JSON, the browser sends OPTIONS to
  // ask permission. Answer it here with no body; the headers are the answer.
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
};
