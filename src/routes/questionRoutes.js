import express from 'express';
import * as QuestionController from '../controllers/QuestionController.js';
import { parseFile, upload } from '../controllers/ParserController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

const adminRoles = ['Super Admin'];
const contentRoles = ['Super Admin', 'Content Manager'];

router.use(protect);

// Parse files (CSV/DOCX/PDF/XLSX) to Staging
router.post('/parse', authorize(...contentRoles), upload.single('file'), parseFile);

// Paste questions from raw text (saves directly as unused)
router.post('/paste', authorize(...contentRoles), QuestionController.pasteQuestions);

// Duplicate detection
router.get('/duplicates', authorize(...contentRoles), QuestionController.findDuplicateQuestions);
router.get('/staged/duplicates', authorize(...contentRoles), QuestionController.findStagedDuplicates);

// Master Question bank routes — any logged-in user could otherwise scrape the
// entire paid bank (correctAnswer/explanation/formula are on every doc). Only
// staff may read the bank; tests serve questions via TestController.getTestById,
// which strips answers for end users.
const staffReadRoles = ['Super Admin', 'Content Manager', 'Support'];
router.get('/', authorize(...staffReadRoles), QuestionController.listQuestions);
router.get('/subjects', authorize(...staffReadRoles), QuestionController.listSubjects);
router.post('/bulk-delete', authorize(...contentRoles), QuestionController.bulkDeleteQuestions);
router.get('/:id', authorize(...staffReadRoles), QuestionController.getQuestionById);
router.post('/', authorize(...contentRoles), QuestionController.createQuestion);
router.put('/:id', authorize(...contentRoles), QuestionController.updateQuestion);
router.delete('/:id', authorize(...contentRoles), QuestionController.deleteQuestion);

// Staging routes
router.get('/staged/all', authorize(...contentRoles), QuestionController.getStagedQuestions);
router.put('/staged/:id', authorize(...contentRoles), QuestionController.updateStagedQuestion);
router.delete('/staged/:id', authorize(...contentRoles), QuestionController.deleteStagedQuestion);
router.post('/staged/approve', authorize(...contentRoles), QuestionController.approveStagedQuestions);
router.post('/staged/approve-to-test', authorize(...contentRoles), QuestionController.approveStagedQuestionsToTest);

export default router;
