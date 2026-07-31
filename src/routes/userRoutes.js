import express from 'express';
import * as UserController from '../controllers/UserController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.use(protect);

router.get('/', authorize(...adminRoles), UserController.listUsers);
router.put('/:id', authorize(...adminRoles), UserController.updateUserRole);
router.delete('/:id', authorize(...adminRoles), UserController.deleteUser);

export default router;
