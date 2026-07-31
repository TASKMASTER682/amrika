import express from 'express';
import * as AuthController from '../controllers/AuthController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', protect, AuthController.getMe);
router.patch('/preferences', protect, AuthController.updatePreferences);

export default router;
