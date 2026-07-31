import express from 'express';
import * as PracticeController from '../controllers/PracticeController.js';
import * as RevisionService from '../services/RevisionService.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Dynamic practice generator and recommendations
router.get('/generate', PracticeController.generatePracticeSet);
router.get('/recommendations', PracticeController.getRecommendations);

// Spaced repetition queues
router.get('/revision/pending', async (req, res, next) => {
  try {
    const list = await RevisionService.getPendingRevisions(req.user._id);
    res.json({ success: true, data: list });
  } catch (error) {
    next(error);
  }
});

router.post('/revision/attempt', async (req, res, next) => {
  try {
    const { questionId, wasCorrect } = req.body;
    if (!questionId) {
      return res.status(400).json({ success: false, message: 'Question ID is required.' });
    }
    const result = await RevisionService.processRevisionAttempt(req.user._id, questionId, wasCorrect);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
