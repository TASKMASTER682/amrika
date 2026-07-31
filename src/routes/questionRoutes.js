import express from 'express';
import * as QuestionController from '../controllers/QuestionController.js';
import { parseFile, upload } from '../controllers/ParserController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

const adminRoles = ['Super Admin'];

router.use(protect);

// Parse files (CSV/DOCX/PDF/XLSX) to Staging
router.post('/parse', authorize(...adminRoles), upload.single('file'), parseFile);

// Paste questions from raw text (saves directly as unused)
router.post('/paste', authorize(...adminRoles), QuestionController.pasteQuestions);

// Master Question bank routes
router.get('/', QuestionController.listQuestions);
router.get('/subjects', QuestionController.listSubjects);
router.post('/bulk-delete', authorize(...adminRoles), QuestionController.bulkDeleteQuestions);
router.get('/:id', QuestionController.getQuestionById);
router.post('/', authorize(...adminRoles), QuestionController.createQuestion);
router.put('/:id', authorize(...adminRoles), QuestionController.updateQuestion);
router.delete('/:id', authorize(...adminRoles), QuestionController.deleteQuestion);

// Staging routes
router.get('/staged/all', authorize(...adminRoles), QuestionController.getStagedQuestions);
router.put('/staged/:id', authorize(...adminRoles), QuestionController.updateStagedQuestion);
router.delete('/staged/:id', authorize(...adminRoles), QuestionController.deleteStagedQuestion);
router.post('/staged/approve', authorize(...adminRoles), QuestionController.approveStagedQuestions);
router.post('/staged/approve-to-test', authorize(...adminRoles), QuestionController.approveStagedQuestionsToTest);

export default router;
