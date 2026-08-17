import jwt from 'jsonwebtoken';
import * as AuthService from '../services/AuthService.js';
import Referral from '../models/Referral.js';
import { clearAuthBuckets } from '../middleware/rateLimiter.js';
import { accessSecret, refreshSecret } from '../config/env.js';

export const register = async (req, res, next) => {
  try {
    const { name, email, password, agencyId, examId, referralCode, signupSource, agencies } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: 'Name, email, and password are required fields.',
      });
    }

    const data = await AuthService.register(name, email, password, 'User', agencyId, examId, referralCode, signupSource, agencies);

    // Only set refresh token cookie if email is already verified (Google OAuth, admin-created)
    if (data.refreshToken) {
      res.cookie('refreshToken', data.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    }

    clearAuthBuckets(req, email);

    res.status(201).json({
      success: true,
      data: {
        user: data.user,
        token: data.token,
      },
      emailVerified: data.emailVerified ?? false,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: 'Email and password are required fields.',
      });
    }

    const data = await AuthService.login(email, password);

    clearAuthBuckets(req, email);

    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        user: data.user,
        token: data.token,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({
    success: true,
    message: 'User logged out successfully.',
  });
};

export const getMe = async (req, res) => {
  const user = await req.user.populate(['primaryAgency', 'primaryExam', 'agencies', 'exams']);
  res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        primaryAgency: user.primaryAgency,
        primaryExam: user.primaryExam,
        agencies: user.agencies,
        exams: user.exams,
        referralCode: user.referralCode,
        subscription: user.subscription,
      },
    },
  });
};

export const updatePreferences = async (req, res, next) => {
  try {
    const { agencies, exams } = req.body;
    const user = req.user;
    if (Array.isArray(agencies)) user.agencies = agencies;
    if (Array.isArray(exams)) user.exams = exams;
    await user.save();
    res.json({ success: true, data: { user: { id: user._id, name: user.name, email: user.email, role: user.role, agencies: user.agencies, exams: user.exams } } });
  } catch (error) {
    next(error);
  }
};

export const otpRequest = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const data = await AuthService.sendOtp(phone);
    clearAuthBuckets(req, phone);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

export const otpLogin = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    const data = await AuthService.verifyOtpLogin(phone, otp);

    clearAuthBuckets(req, phone);

    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: { user: data.user, token: data.token },
    });
  } catch (error) {
    next(error);
  }
};

export const myReferral = async (req, res, next) => {
  try {
    const user = req.user;
    const referral = await Referral.findOne({ user: user._id });
    res.json({
      success: true,
      data: {
        code: user.referralCode || referral?.code || null,
        referralCount: referral?.referralCount || 0,
        rewardAmount: referral?.rewardAmount || 0,
        link: user.referralCode ? `${process.env.CLIENT_URL || 'http://localhost:3000'}/register?ref=${user.referralCode}` : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    const cookies = {};
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const name = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      if (name) cookies[name] = decodeURIComponent(value);
    });
    const refreshToken = cookies.refreshToken;

    const data = await AuthService.refresh(refreshToken);

    res.cookie('refreshToken', data.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        token: data.token,
        user: data.user,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

    // If the user is already logged in (token in params), just return status
    if (!token) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: 'Verification token is required.',
      });
    }

    const data = await AuthService.verifyEmail(token);

    if (data.alreadyVerified) {
      return res.status(200).json({
        success: true,
        message: 'Email already verified. Please log in.',
      });
    }

    const user = data.user;

    // Issue fresh tokens after verification (no password required)
    const accessToken = jwt.sign({ id: user.id, role: user.role, name: user.name }, accessSecret, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id }, refreshSecret, { expiresIn: '7d' });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      message: 'Email verified successfully.',
      data: { user, token: accessToken },
    });
  } catch (error) {
    next(error);
  }
};

export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        code: 'BAD_REQUEST',
        message: 'Email is required.',
      });
    }

    const result = await AuthService.resendVerification(email);

    res.json({
      success: true,
      message: 'Verification email sent successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const googleAuth = (req, res, next) => {
  next();
};

export const googleCallback = async (req, res, next) => {
  try {
    if (!req.user || !req.user.token) {
      const redirectUrl = new URL(process.env.CLIENT_URL || 'http://localhost:3000');
      redirectUrl.pathname = '/login';
      redirectUrl.searchParams.set('error', 'google_auth_failed');
      return res.redirect(redirectUrl.toString());
    }

    const { token, refreshToken, ...user } = req.user;

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const redirectUrl = new URL(process.env.CLIENT_URL || 'http://localhost:3000');
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('provider', 'google');

    res.redirect(redirectUrl.toString());
  } catch (error) {
    next(error);
  }
};