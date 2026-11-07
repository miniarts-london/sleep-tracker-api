import type { ErrorRequestHandler } from 'express';

// The one central error handler. Express treats a middleware with four
// parameters (err, req, res, next) as an error handler, and jumps here
// whenever an earlier step throws or passes an error along.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Some errors (e.g. invalid JSON in the request body) come with a 4xx
  // status: the client sent something wrong, so we can tell them what.
  const isClientError =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 500;

  if (isClientError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Anything else is our fault. Log the details for us, but send the
  // client a generic message so internal details never leak out.
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
