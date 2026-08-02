import express from 'express';
import * as TestSeriesController from '../controllers/TestSeriesController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];
const contentRoles = ['Super Admin', 'Content Manager'];

router.use(protect);

router.get('/', TestSeriesController.listTestSeries);
router.get('/search', TestSeriesController.searchTestSeries);
router.get('/:id', TestSeriesController.getTestSeriesById);
router.post('/', authorize(...contentRoles), TestSeriesController.createTestSeries);
router.put('/:id', authorize(...contentRoles), TestSeriesController.updateTestSeries);
router.post('/:id/banner', authorize(...contentRoles), TestSeriesController.uploadBanner);
router.delete('/:id', authorize(...adminRoles), TestSeriesController.deleteTestSeries);

export default router;
