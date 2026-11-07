import { Router } from 'express';
import { createEntry, getUserEntry, listUserEntries } from '../controllers/entries.ts';

// Only URL-to-handler mapping here; the work happens in the controller.
const router = Router();

router.post('/entries', createEntry);
router.get('/users/:userId/entries', listUserEntries);
router.get('/users/:userId/entries/:date', getUserEntry);

export default router;
