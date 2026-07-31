import express from 'express';
import * as AgencyController from '../controllers/AgencyController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];

router.get('/', AgencyController.listAgencies);
router.get('/:id', AgencyController.getAgencyById);

router.use(protect);
router.post('/', authorize(...adminRoles), AgencyController.createAgency);
router.put('/:id', authorize(...adminRoles), AgencyController.updateAgency);
router.delete('/:id', authorize(...adminRoles), AgencyController.deleteAgency);

export default router;
