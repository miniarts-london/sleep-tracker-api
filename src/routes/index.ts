import { Router } from 'express';
import authRouter from './auth.ts';
import entriesRouter from './entries.ts';

// All API routes live on this router. app.ts mounts it under /api,
// so '/entries' here is reached at '/api/entries'.
const router = Router();

// Public routes first (register, login), then the protected sleep routes.
router.use(authRouter);
router.use(entriesRouter);

export default router;
