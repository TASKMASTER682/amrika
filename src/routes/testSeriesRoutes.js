import express from 'express';
import * as TestSeriesController from '../controllers/TestSeriesController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.use(protect);

router.get('/', TestSeriesController.listTestSeries);
router.get('/search', TestSeriesController.searchTestSeries);
router.get('/:id', TestSeriesController.getTestSeriesById);
router.post('/', authorize(...adminRoles), TestSeriesController.createTestSeries);
router.put('/:id', authorize(...adminRoles), TestSeriesController.updateTestSeries);
router.delete('/:id', authorize(...adminRoles), TestSeriesController.deleteTestSeries);

export default router;
