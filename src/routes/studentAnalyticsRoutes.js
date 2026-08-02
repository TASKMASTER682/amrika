import express from 'express';
import * as StudentAnalyticsController from '../controllers/StudentAnalyticsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/weak-areas', StudentAnalyticsController.getWeakAreas);
router.get('/daily-stats', StudentAnalyticsController.getDailyStats);
router.get('/trends', StudentAnalyticsController.getPerformanceTrend);
router.get('/gamification', StudentAnalyticsController.getMyGamification);

export default router;
