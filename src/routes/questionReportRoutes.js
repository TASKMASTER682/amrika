import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  reportQuestion,
  getMyReports,
  listReports,
  updateReportStatus,
} from '../controllers/QuestionReportController.js';

const router = Router();

// Student
router.use(protect);
router.post('/', reportQuestion);
router.get('/my', getMyReports);

// Admin
router.get('/', authorize('Super Admin', 'Admin', 'Support Staff'), listReports);
router.patch('/:id/status', authorize('Super Admin', 'Admin'), updateReportStatus);

export default router;
