import express from 'express';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// NOTE: user listing / role updates / deletion live under /api/admin/users
// (Super Admin only, fully guarded + audit-logged). No per-user admin
// routes are exposed here on purpose — the old unguarded duplicates
// (GET /, PUT /:id, DELETE /:id) were removed.

export default router;
