import express from 'express';
import * as DoubtController from '../controllers/DoubtController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();
const staffRoles = ['Super Admin', 'Content Manager', 'Support'];

router.use(protect);

router.get('/', DoubtController.listDoubts);
router.get('/:id', DoubtController.getDoubtById);
router.post('/', DoubtController.createDoubt);
router.post('/:id/reply', DoubtController.addReply);
router.patch('/:id/resolve', DoubtController.resolveDoubt);
router.delete('/:id', authorize(...staffRoles), DoubtController.deleteDoubt);

export default router;
