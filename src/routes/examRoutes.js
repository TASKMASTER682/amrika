import express from 'express';
import * as ExamController from '../controllers/ExamController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.get('/', ExamController.listExams);
router.get('/:id', ExamController.getExamById);

router.use(protect);
router.post('/', authorize(...adminRoles), ExamController.createExam);
router.put('/:id', authorize(...adminRoles), ExamController.updateExam);
router.delete('/:id', authorize(...adminRoles), ExamController.deleteExam);

export default router;
