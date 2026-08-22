import express from 'express';
import * as TestController from '../controllers/TestController.js';
import { protect, optionalProtect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

// Public read access — anyone can browse published tests.
router.get('/', optionalProtect, TestController.listTests);
router.get('/:id', optionalProtect, TestController.getTestById);

// Write/delete require auth + staff role.
router.use(protect);
router.post('/', authorize(...adminRoles), TestController.createTest);
router.put('/:id', authorize(...adminRoles), TestController.updateTest);
router.delete('/:id', authorize(...adminRoles), TestController.deleteTest);

export default router;
