import { Router } from 'express';
import { login, register } from '../controllers/auth.ts';

// Sign-up and login. These must stay public: you can't have a token yet.
const router = Router();

router.post('/auth/register', register);
router.post('/auth/login', login);

export default router;
