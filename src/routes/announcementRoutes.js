import express from 'express';
import * as AnnouncementController from '../controllers/AnnouncementController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const adminRoles = ['Super Admin'];
const staffRoles = ['Super Admin', 'Content Manager', 'Support'];

router.get('/active', AnnouncementController.listActiveAnnouncements);

router.use(protect);

router.get('/', authorize(...staffRoles), AnnouncementController.listAll);
router.post('/', authorize(...staffRoles), AnnouncementController.create);
router.put('/:id', authorize(...adminRoles), AnnouncementController.update);
router.delete('/:id', authorize(...adminRoles), AnnouncementController.remove);

export default router;
