import express from 'express';
import * as TestAttemptController from '../controllers/TestAttemptController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/start', TestAttemptController.startTest);
router.put('/:attemptId/save', TestAttemptController.saveProgress);
router.post('/:attemptId/submit', TestAttemptController.submitTest);
router.get('/:attemptId/results', TestAttemptController.getAttemptResults);
router.get('/history', TestAttemptController.listStudentHistory);

// Admin: re-score a single attempt
router.post('/:attemptId/rescore', authorize('Super Admin', 'Admin'), TestAttemptController.rescoreAttempt);

// Admin: re-score all attempts for a test
router.post('/rescore-all/:testId', authorize('Super Admin', 'Admin'), TestAttemptController.rescoreAllAttempts);

// Admin cleanup: delete old unsubmitted attempts (older than 24h)
router.delete('/cleanup/old-unsubmitted', TestAttemptController.cleanupOldUnsubmitted);

// Force reset: delete a specific stuck attempt
router.delete('/:attemptId/remove-stuck', async (req, res) => { try { const r = await require('../models/TestAttempt.js').default.deleteOne({_id: req.params.attemptId}); res.json({success: true, deleted: r?.deletedCount || 0}); } catch(e) { res.status(500).json({success:false, error: e.message}); } });

export default router;
