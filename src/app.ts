import express from 'express';
import { errorHandler } from './middleware/errorHandler.ts';
import apiRouter from './routes/index.ts';

const app = express();

// 1. Turn JSON request bodies into objects on req.body.
app.use(express.json());

// 2. Health check at the root: it's about the server, not the API data.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 3. All API routes, mounted under /api (e.g. /api/entries).
app.use('/api', apiRouter);

// 4. No route matched: 404.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 5. The central error handler always goes last.
app.use(errorHandler);

export default app;
