import express from 'express';
import * as RevenueController from '../controllers/RevenueController.js';
import * as EngagementController from '../controllers/EngagementController.js';
import * as AnalyticsTrackController from '../controllers/AnalyticsTrackController.js';
import * as AnalyticsDashboardController from '../controllers/AnalyticsDashboardController.js';
import { protect, authorize, optionalProtect } from '../middleware/auth.js';
import { analyticsTrackLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

// PUBLIC: lightweight fire-and-forget tracking from the browser (pageviews + live heartbeat)
router.post('/track', optionalProtect, analyticsTrackLimiter, AnalyticsTrackController.track);

// Everything below is Super Admin only.
router.use(protect, authorize(...adminRoles));

router.get('/live', AnalyticsDashboardController.getLive);
router.get('/visits', AnalyticsDashboardController.getVisits);
router.get('/revenue', RevenueController.getRevenueDashboard);
router.get('/engagement', EngagementController.getEngagementDashboard);

export default router;