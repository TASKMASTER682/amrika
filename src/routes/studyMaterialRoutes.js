import express from 'express';
import * as StudyMaterialController from '../controllers/StudyMaterialController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const staffRoles = ['Super Admin', 'Content Manager', 'Support'];

router.use(protect);

router.get('/', StudyMaterialController.listMaterials);
router.get('/:id', StudyMaterialController.getMaterialById);
router.get('/:id/download', StudyMaterialController.downloadMaterial);

router.post('/', authorize(...staffRoles), StudyMaterialController.createMaterial);
router.put('/:id', authorize(...staffRoles), StudyMaterialController.updateMaterial);
router.delete('/:id', authorize(...staffRoles), StudyMaterialController.deleteMaterial);

export default router;
