const express = require('express');
const controller = require('../controllers/analytics.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard-summary', controller.getDashboardSummary);
router.get('/trend', controller.getPerformanceTrend);
router.get('/attempt/:attemptId', controller.getAttemptAnalytics);

module.exports = router;
