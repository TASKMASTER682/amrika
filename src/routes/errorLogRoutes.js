import express from 'express';
import * as ErrorLogController from '../controllers/ErrorLogController.js';
import { protect, authorize, optionalProtect } from '../middleware/auth.js';
import { errorLogLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Client-side error reporting — anonymous ok, user attached when logged in.
router.post('/', optionalProtect, errorLogLimiter, ErrorLogController.reportError);

// Admin management (Super Admin only).
router.get('/', protect, authorize('Super Admin'), ErrorLogController.listErrors);
router.patch('/:id/status', protect, authorize('Super Admin'), ErrorLogController.updateErrorStatus);
router.delete('/:id', protect, authorize('Super Admin'), ErrorLogController.deleteError);

export default router;