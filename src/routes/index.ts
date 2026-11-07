import { Router } from 'express';

// All API routes live on this router. app.ts mounts it under /api,
// so a route added here as '/entries' is reached at '/api/entries'.
// It's empty for now; the entries routes get added in a later step.
const router = Router();

export default router;
