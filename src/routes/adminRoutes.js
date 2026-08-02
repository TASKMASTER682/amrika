import express from 'express';
import * as AdminController from '../controllers/AdminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];
const supportRoles = ['Super Admin', 'Content Manager', 'Support'];

router.use(protect, authorize(...supportRoles));

router.get('/attempts', AdminController.listAttempts);
router.get('/attempts/:id', AdminController.getAttemptDetail);
router.get('/users', AdminController.listUsers);
router.put('/users/:id', authorize(...adminRoles), AdminController.updateUser);
router.post('/users/:id/reset-password', authorize(...adminRoles), AdminController.resetPassword);
router.post('/users/:id/force-logout', authorize(...adminRoles), AdminController.forceLogout);
router.get('/audit-logs', authorize(...adminRoles), AdminController.listAuditLogs);

export default router;
