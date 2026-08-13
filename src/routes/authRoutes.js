import express from 'express';
import * as AuthController from '../controllers/AuthController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate, registerSchema, loginSchema } from '../middleware/validate.js';

const router = express.Router();

// Tight auth limiter only on credential endpoints — /me, /logout, /referral etc.
// should not drain the login budget (they fire on every page reload).
router.post('/register', authLimiter, validate(registerSchema), AuthController.register);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/otp-request', authLimiter, AuthController.otpRequest);
router.post('/otp-login', authLimiter, AuthController.otpLogin);
router.get('/me', protect, AuthController.getMe);
router.patch('/preferences', protect, AuthController.updatePreferences);
router.get('/referral', protect, AuthController.myReferral);

export default router;
