import express from 'express';
import * as TestController from '../controllers/TestController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.use(protect);

router.post('/', authorize(...adminRoles), TestController.createTest);
router.get('/', TestController.listTests);
router.get('/:id', TestController.getTestById);
router.put('/:id', authorize(...adminRoles), TestController.updateTest);
router.delete('/:id', authorize(...adminRoles), TestController.deleteTest);

export default router;
