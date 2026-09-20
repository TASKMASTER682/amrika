import express from 'express';
import * as FlashcardController from '../controllers/FlashcardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/deck', FlashcardController.getDeck);
router.get('/due', FlashcardController.getDueCards);
router.get('/stats', FlashcardController.getStats);
router.get('/subjects', FlashcardController.getSubjects);
router.post('/generate', FlashcardController.generateFlashcards);
router.post('/review/:id', FlashcardController.reviewCard);
router.post('/review-batch', FlashcardController.reviewBatch);
router.post('/session', FlashcardController.saveSession);
router.delete('/cards/:id', FlashcardController.deleteCard);
router.delete('/by-attempt/:attemptId', FlashcardController.deleteByAttempt);

export default router;
