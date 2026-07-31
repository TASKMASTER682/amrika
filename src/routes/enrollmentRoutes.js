import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { enroll, unenroll, myEnrollments, checkEnrolled } from '../controllers/EnrollmentController.js';

const router = Router();

router.use(protect);

router.get('/me', myEnrollments);
router.post('/enroll/:testSeriesId', enroll);
router.delete('/unenroll/:testSeriesId', unenroll);
router.get('/check/:testSeriesId', checkEnrolled);

export default router;
