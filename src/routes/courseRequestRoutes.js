import express from 'express';
import * as CourseRequestController from '../controllers/CourseRequestController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin', 'Content Manager', 'Support'];

router.use(protect);

router.post('/', CourseRequestController.createCourseRequest);
router.get('/me', CourseRequestController.getMyCourseRequests);
router.get('/', authorize(...adminRoles), CourseRequestController.listCourseRequests);
router.patch('/:id/status', authorize(...adminRoles), CourseRequestController.updateCourseRequestStatus);
router.post('/bulk-telegram', authorize(...adminRoles), CourseRequestController.bulkSendTelegram);

export default router;
