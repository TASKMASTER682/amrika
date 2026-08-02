import express from 'express';
import * as CouponController from '../controllers/CouponController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.post('/validate', protect, CouponController.validateCoupon);
router.get('/', protect, authorize(...adminRoles), CouponController.listCoupons);
router.post('/', protect, authorize(...adminRoles), CouponController.createCoupon);
router.put('/:id', protect, authorize(...adminRoles), CouponController.updateCoupon);
router.delete('/:id', protect, authorize(...adminRoles), CouponController.deleteCoupon);

export default router;
