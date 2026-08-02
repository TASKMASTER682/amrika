import express from 'express';
import * as RevenueController from '../controllers/RevenueController.js';
import * as EngagementController from '../controllers/EngagementController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.use(protect, authorize(...adminRoles));

router.get('/revenue', RevenueController.getRevenueDashboard);
router.get('/engagement', EngagementController.getEngagementDashboard);

export default router;
