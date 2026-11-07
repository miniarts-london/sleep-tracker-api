import { Router } from 'express';
import entriesRouter from './entries.ts';

// All API routes live on this router. app.ts mounts it under /api,
// so '/entries' here is reached at '/api/entries'.
const router = Router();

router.use(entriesRouter);

export default router;
