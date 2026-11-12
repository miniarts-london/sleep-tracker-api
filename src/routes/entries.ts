import { Router } from 'express';
import {
  createEntry,
  getUserEntry,
  listEntries,
  listUserEntries,
} from '../controllers/entries.ts';
import { requireAuth } from '../middleware/requireAuth.ts';

// Only URL-to-handler mapping here; the work happens in the controller.
const router = Router();

// Every sleep route needs a logged-in user: requireAuth runs first and only
// lets the request through to the handler if the token is valid.
// It's added per route rather than with router.use(requireAuth): this router
// is mounted at /api, so router.use would also catch /api/auth/* and turn
// unknown /api URLs into 401s instead of 404s.
router.get('/entries', requireAuth, listEntries);
router.post('/entries', requireAuth, createEntry);
router.get('/users/:userId/entries', requireAuth, listUserEntries);
router.get('/users/:userId/entries/:date', requireAuth, getUserEntry);

export default router;
