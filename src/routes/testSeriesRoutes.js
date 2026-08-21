import express from 'express';
import * as TestSeriesController from '../controllers/TestSeriesController.js';
import { protect, optionalProtect, authorize } from '../middleware/auth.js';
import { validate, createTestSeriesSchema, updateTestSeriesSchema } from '../middleware/validate.js';

const router = express.Router();
const adminRoles = ['Super Admin'];
const contentRoles = ['Super Admin', 'Content Manager'];

// Public reads — active test series are viewable without login.
// Staff with a valid token may pass ?all=true to include inactive series.
router.get('/', optionalProtect, TestSeriesController.listTestSeries);
router.get('/search', optionalProtect, TestSeriesController.searchTestSeries);
// Public SEO catalog (must be registered before /:id).
router.get('/public', optionalProtect, TestSeriesController.listPublicSeries);
router.get('/public/:slug', optionalProtect, TestSeriesController.getPublicSeries);
router.get('/:id', optionalProtect, TestSeriesController.getTestSeriesById);

router.use(protect);
router.post('/', authorize(...contentRoles), validate(createTestSeriesSchema), TestSeriesController.createTestSeries);
router.put('/:id', authorize(...contentRoles), validate(updateTestSeriesSchema), TestSeriesController.updateTestSeries);
router.post('/:id/banner', authorize(...contentRoles), TestSeriesController.uploadBanner);
router.delete('/:id', authorize(...adminRoles), TestSeriesController.deleteTestSeries);

export default router;