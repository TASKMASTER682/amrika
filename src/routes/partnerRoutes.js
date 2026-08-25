import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  applyAsPartner,
  getMyPartnerProfile,
  getMyTestSeries,
  createTestSeries,
  updateTestSeries,
  addQuestions,
  removeQuestion,
  toggleVisibility,
  sendMessage,
  getMyMessages,
  getMyEarnings,
} from '../controllers/PartnerController.js';

const router = Router();

// All partner routes require authentication
router.use(protect);

// Profile
router.post('/apply', applyAsPartner);
router.get('/profile', getMyPartnerProfile);

// Test series
router.get('/test-series', getMyTestSeries);
router.post('/test-series', createTestSeries);
router.put('/test-series/:id', updateTestSeries);
router.post('/test-series/:id/questions', addQuestions);
router.delete('/test-series/:seriesId/questions/:questionId', removeQuestion);
router.patch('/test-series/:id/visibility', toggleVisibility);

// Messages
router.post('/messages', sendMessage);
router.get('/messages', getMyMessages);

// Earnings
router.get('/earnings', getMyEarnings);

export default router;
