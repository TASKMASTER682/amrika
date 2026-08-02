import express from 'express';
import * as OrderController from '../controllers/OrderController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.use(protect);

router.get('/plans/active', OrderController.listActivePlans);
router.post('/checkout', OrderController.checkout);
router.post('/verify', OrderController.verifyPayment);
router.get('/my-orders', OrderController.myOrders);
router.get('/', authorize(...adminRoles), OrderController.adminListOrders);
router.post('/:id/refund', authorize(...adminRoles), OrderController.refundOrder);

export default router;
