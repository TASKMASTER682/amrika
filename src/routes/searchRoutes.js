import express from 'express';
import { globalSearch } from '../controllers/SearchController.js';

const router = express.Router();

// Public — search runs on every keystroke, keep it unauthenticated and fast.
router.get('/', globalSearch);

export default router;
