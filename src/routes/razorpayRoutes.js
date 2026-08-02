import express from 'express';
import * as RazorpayConfigController from '../controllers/RazorpayConfigController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.use(protect, authorize(...adminRoles));

router.get('/', RazorpayConfigController.getRazorpayConfig);
router.post('/', RazorpayConfigController.saveRazorpayConfig);

export default router;