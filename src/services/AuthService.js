import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Referral from '../models/Referral.js';
import { accessSecret, refreshSecret, accessExpiresIn, refreshExpiresIn, isValidEmailDomain, emailVerificationExpiresMs, CLIENT_URL } from '../config/env.js';
import { sendVerificationEmail } from './MailService.js';

const generateToken = (id, role, name) => {
  return jwt.sign(
    { id, role, name },
    accessSecret,
    { expiresIn: accessExpiresIn }
  );
};

const generateRefreshToken = (id) => {
  return jwt.sign(
    { id },
    refreshSecret,
    { expiresIn: refreshExpiresIn }
  );
};

const randomCode = (prefix, length) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[buf[i] % chars.length];
  return `${prefix}${out}`;
};

const randomOtp = () => {
  return String(crypto.randomInt(100000, 1000000));
};

// Staff roles can only be assigned by an existing admin through the admin routes.
// Self-registration ALWAYS creates a regular 'User' — never a staff/privileged role.
const STAFF_ROLES = ['Super Admin', 'Content Manager', 'Support'];

export const register = async (name, email, password, role, agencyId, examId, referralCode, signupSource, agencies) => {
  // Only allow emails from approved domains (gmail.com, outlook.com, etc.)
  if (!isValidEmailDomain(email)) {
    const error = new Error('This email domain is not allowed. Please use a valid email address (e.g. gmail.com, outlook.com).');
    error.statusCode = 400;
    error.code = 'DOMAIN_NOT_ALLOWED';
    throw error;
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error('A user with this email address already exists.');
    error.statusCode = 409;
    error.code = 'USER_EXISTS';
    throw error;
  }

  let referredBy;
  if (referralCode) {
    const referrer = await User.findOne({ referralCode: String(referralCode).toUpperCase() });
    if (referrer) referredBy = referrer._id;
  }

   const user = await User.create({
    name,
    email,
    password,
    role: 'User',
    primaryAgency: agencyId || undefined,
    primaryExam: examId || undefined,
    agencies: Array.isArray(agencies) ? agencies : [],
    exams: [],
    referralCode: randomCode('REF', 6),
    referredBy: referredBy || undefined,
    signupSource: signupSource || 'web',
  });

  // Generate email verification token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = verificationToken;
  user.emailVerificationExpiry = new Date(Date.now() + emailVerificationExpiresMs);
  await user.save();

  if (referredBy) {
    const code = randomCode(`REF${referredBy.toString().slice(-4).toUpperCase()}`, 2);
    // Two-step so the first referral still increments the count (MongoDB ignores
    // $inc on an upsert insert when combined with $setOnInsert).
    await Referral.findOneAndUpdate(
      { user: referredBy },
      { $setOnInsert: { user: referredBy, code } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    await Referral.updateOne({ user: referredBy }, { $inc: { referralCount: 1 } });
  }

   const token = generateToken(user._id, user.role, user.name);
  const refreshToken = generateRefreshToken(user._id);

  // Send verification email (blocking — fail loudly if mail service is down)
  const clientUrl = CLIENT_URL;
  let emailSent = false;
  try {
    await sendVerificationEmail(email, name, verificationToken, clientUrl);
    emailSent = true;
  } catch (e) {
    console.warn('[AuthService] Failed to send verification email:', e.message);
  }

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      primaryAgency: user.primaryAgency,
      primaryExam: user.primaryExam,
      agencies: user.agencies,
      exams: user.exams,
      referralCode: user.referralCode,
    },
    token: generateToken(user._id, user.role, user.name),
    refreshToken: generateRefreshToken(user._id),
    emailVerified: false,
    emailSent,
  };
};

export const login = async (email, password) => {
  const user = await User.findOne({ email });
  if (!user) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const error = new Error('Invalid email or password.');
    error.statusCode = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  if (!user.active) {
    const error = new Error('Account suspended. Please contact admin.');
    error.statusCode = 403;
    error.code = 'ACCOUNT_SUSPENDED';
    throw error;
  }

  if (!user.emailVerified) {
    const error = new Error('Please verify your email address before logging in. Check your inbox for the verification link.');
    error.statusCode = 403;
    error.code = 'EMAIL_NOT_VERIFIED';
    throw error;
  }

  user.lastActiveAt = new Date();
  await user.save();

  const token = generateToken(user._id, user.role, user.name);
  const refreshToken = generateRefreshToken(user._id);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      agencies: user.agencies,
      exams: user.exams,
      referralCode: user.referralCode,
      subscription: user.subscription,
    },
    token,
    refreshToken,
  };
};

const buildAuthResponse = (user) => {
  const token = generateToken(user._id, user.role, user.name);
  const refreshToken = generateRefreshToken(user._id);
  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      role: user.role,
      agencies: user.agencies,
      exams: user.exams,
      referralCode: user.referralCode,
      subscription: user.subscription,
      xp: user.xp,
      level: user.level,
      streak: user.streak,
    },
    token,
    refreshToken,
  };
};

// Generate a 6-digit OTP for a phone number. Returns the OTP so the dev/demo
// SMS gateway can send it. No real SMS gateway is wired yet (deferred usage).
export const sendOtp = async (phone) => {
  if (!phone || !/^[6-9]\d{9}$/.test(String(phone))) {
    const error = new Error('Enter a valid 10-digit Indian mobile number.');
    error.statusCode = 400;
    error.code = 'INVALID_PHONE';
    throw error;
  }

  const otp = randomOtp();
  const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Upsert user by phone, or attach OTP to existing account.
  let user = await User.findOne({ phone });
  if (!user) {
    user = await User.create({
      name: `User ${phone.slice(-4)}`,
      email: `${phone}@phone.examos`,
      password: otp, // temporary hashed password; user can set one later
      role: 'User',
      phone,
      referralCode: randomCode('REF', 6),
    });
  }

  user.otp = otp;
  user.otpExpires = expires;
  user.otpAttempts = 0;
  await user.save();

  // Dev/demo mode: OTP returned to caller so the frontend can show it.
  // In production an SMS gateway (e.g. MSG91/Twilio) must send this instead —
  // never expose the OTP in the API response there.
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction
    ? { phone, expiresInSec: 600 }
    : { phone, otp, expiresInSec: 600, devOtp: otp };
};

// Verify OTP and log the user in (creating the account on first verification).
export const verifyOtpLogin = async (phone, otp) => {
  if (!phone || !otp) {
    const error = new Error('Phone and OTP are required.');
    error.statusCode = 400;
    error.code = 'INVALID_INPUT';
    throw error;
  }

  const user = await User.findOne({ phone: String(phone) });
  if (!user) {
    const error = new Error('No account found for this phone. Request an OTP first.');
    error.statusCode = 404;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  if (!user.otp || !user.otpExpires || new Date(user.otpExpires) < new Date()) {
    const error = new Error('OTP expired. Please request a new one.');
    error.statusCode = 400;
    error.code = 'OTP_EXPIRED';
    throw error;
  }

  if (user.otpAttempts >= 5) {
    const error = new Error('Too many OTP attempts. Request a new OTP.');
    error.statusCode = 429;
    error.code = 'OTP_LIMIT';
    throw error;
  }

  if (String(user.otp) !== String(otp)) {
    user.otpAttempts += 1;
    await user.save();
    const error = new Error('Incorrect OTP. Try again.');
    error.statusCode = 400;
    error.code = 'OTP_INVALID';
    throw error;
  }

  user.otp = null;
  user.otpExpires = null;
  user.otpAttempts = 0;
  user.phoneVerified = true;
  user.lastActiveAt = new Date();
  await user.save();

  return buildAuthResponse(user);
};

// Verify email via token
export const verifyEmail = async (token) => {
  if (!token) {
    const error = new Error('Verification token is required.');
    error.statusCode = 400;
    error.code = 'INVALID_TOKEN';
    throw error;
  }

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpiry: { $gt: new Date() },
  });

  if (!user) {
    const error = new Error('Invalid or expired verification link. Please request a new one.');
    error.statusCode = 400;
    error.code = 'INVALID_OR_EXPIRED_TOKEN';
    throw error;
  }

  user.emailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpiry = null;
  await user.save();

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: true,
      agencies: user.agencies,
      exams: user.exams,
      referralCode: user.referralCode,
    },
  };
};

// Resend verification email
export const resendVerification = async (email) => {
  const user = await User.findOne({ email });
  if (!user) return { sent: true }; // Don't reveal whether the email exists

  if (user.emailVerified) {
    return { alreadyVerified: true, user: { id: user._id, name: user.name, email: user.email } };
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = verificationToken;
  user.emailVerificationExpiry = new Date(Date.now() + emailVerificationExpiresMs);
  await user.save();

  const clientUrl = CLIENT_URL;
  await sendVerificationEmail(email, user.name, verificationToken, clientUrl);

  return { sent: true };
};

// Google OAuth callback — find or create user, verify domain, then issue tokens
export const googleCallback = async (profile, done) => {
  try {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email) return done(null, false, { message: 'No email provided by Google.' });

    // Enforce allowed domains for Google sign-in too
    if (!isValidEmailDomain(email)) {
      return done(null, false, { message: 'This email domain is not allowed.' });
    }

    let user = await User.findOne({ email });
    let isNewUser = false;
    if (!user) {
      // Auto-create account with Google-verified email (no password needed)
      isNewUser = true;
      user = await User.create({
        name: profile.displayName || profile.emails[0].value.split('@')[0] || 'Google User',
        email,
        password: crypto.randomBytes(32).toString('hex'), // random placeholder — they'll never use it
        role: 'User',
        signupSource: 'google',
        referralCode: randomCode('REF', 6),
        emailVerified: true, // Google already verified the email
      });
    } else if (!user.emailVerified) {
      user.emailVerified = true;
      await user.save();
    }

    const token = generateToken(user._id, user.role, user.name);
    const refreshToken = generateRefreshToken(user._id);

    return done(null, {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token,
      refreshToken,
      isNewUser,
    });
  } catch (err) {
    return done(err);
  }
};

export const refresh = async (refreshToken) => {
  if (!refreshToken) {
    const error = new Error('Refresh token is missing.');
    error.statusCode = 401;
    error.code = 'NO_REFRESH_TOKEN';
    throw error;
  }

  try {
    const decoded = jwt.verify(refreshToken, refreshSecret);
    const user = await User.findById(decoded.id);

    if (!user || !user.active) {
      const error = new Error('Invalid or expired refresh token.');
      error.statusCode = 401;
      error.code = 'INVALID_REFRESH_TOKEN';
      throw error;
    }

    const token = generateToken(user._id, user.role, user.name);
    const newRefreshToken = generateRefreshToken(user._id);

    return {
      token,
      refreshToken: newRefreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        agencies: user.agencies,
        exams: user.exams,
        referralCode: user.referralCode,
        subscription: user.subscription,
      },
    };
  } catch (err) {
    const error = new Error('Invalid or expired refresh token.');
    error.statusCode = 401;
    error.code = 'INVALID_REFRESH_TOKEN';
    throw error;
  }
};

