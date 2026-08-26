import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  listPartners,
  getPartnerDetails,
  reviewPartner,
  updateRevenueShare,
  listPartnerTestSeries,
  getTestSeriesForReview,
  saveFormattedQuestion,
  clearFormattedQuestion,
  reviewTestSeries,
  publishTestSeries,
  listMessages,
  replyToMessage,
  getPartnerEarnings,
} from '../controllers/AdminPartnerController.js';

const router = Router();

const adminRoles = ['Super Admin'];
const supportRoles = ['Super Admin', 'Content Manager', 'Support'];

// All admin partner routes require authentication + admin role
router.use(protect);

// Partners
router.get('/partners', authorize(...supportRoles), listPartners);
router.get('/partners/:id', authorize(...supportRoles), getPartnerDetails);
router.patch('/partners/:id/review', authorize(...adminRoles), reviewPartner);
router.patch('/partners/:id/revenue-share', authorize(...adminRoles), updateRevenueShare);
router.get('/partners/:id/earnings', authorize(...adminRoles), getPartnerEarnings);

// Partner test series
router.get('/partner-test-series', authorize(...supportRoles), listPartnerTestSeries);
router.get('/partner-test-series/:id', authorize(...supportRoles), getTestSeriesForReview);
router.patch('/partner-test-series/:id/review', authorize(...adminRoles), reviewTestSeries);
router.patch('/partner-test-series/:id/publish', authorize(...adminRoles), publishTestSeries);

// Question formatting
router.patch('/partner-test-series/:seriesId/questions/:questionId/format', authorize(...supportRoles), saveFormattedQuestion);
router.patch('/partner-test-series/:seriesId/questions/:questionId/clear', authorize(...supportRoles), clearFormattedQuestion);

// Messages
router.get('/partner-messages', authorize(...supportRoles), listMessages);
router.patch('/partner-messages/:id/reply', authorize(...supportRoles), replyToMessage);

export default router;
