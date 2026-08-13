import express from 'express';
import * as LeaderboardController from '../controllers/LeaderboardController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/my-series', LeaderboardController.getMySeriesLeaderboards);
router.get('/test/:testId', LeaderboardController.getTestLeaderboard);
router.get('/series/:testSeriesId', LeaderboardController.getTestSeriesLeaderboard);

export default router;
