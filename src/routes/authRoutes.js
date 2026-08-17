import express from 'express';
import passport from 'passport';
import * as AuthController from '../controllers/AuthController.js';
import { protect } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate, registerSchema, loginSchema } from '../middleware/validate.js';

const router = express.Router();

// Email/password registration — requires domain validation + email verification
router.post('/register', authLimiter, validate(registerSchema), AuthController.register);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/logout', AuthController.logout);
router.post('/refresh', AuthController.refresh);

// Email verification
router.get('/verify-email/:token', AuthController.verifyEmail);
router.post('/resend-verification', authLimiter, AuthController.resendVerification);

// Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=google_auth_failed' }),
  AuthController.googleCallback
);

// Phone OTP
router.post('/otp-request', authLimiter, AuthController.otpRequest);
router.post('/otp-login', authLimiter, AuthController.otpLogin);

// Authenticated
router.get('/me', protect, AuthController.getMe);
router.patch('/preferences', protect, AuthController.updatePreferences);
router.get('/referral', protect, AuthController.myReferral);

export default router;
