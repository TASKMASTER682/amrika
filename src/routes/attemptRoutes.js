import express from 'express';
import * as TestAttemptController from '../controllers/TestAttemptController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/start', TestAttemptController.startTest);
router.put('/:attemptId/save', TestAttemptController.saveProgress);
router.post('/:attemptId/submit', TestAttemptController.submitTest);
router.get('/:attemptId/results', TestAttemptController.getAttemptResults);
router.get('/history', TestAttemptController.listStudentHistory);

export default router;
