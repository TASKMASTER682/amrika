import express from 'express';
import * as PlanController from '../controllers/PlanController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.get('/', protect, PlanController.listPlans);
router.get('/:id', protect, PlanController.getPlanById);
router.post('/', protect, authorize(...adminRoles), PlanController.createPlan);
router.put('/:id', protect, authorize(...adminRoles), PlanController.updatePlan);
router.delete('/:id', protect, authorize(...adminRoles), PlanController.deletePlan);

export default router;
