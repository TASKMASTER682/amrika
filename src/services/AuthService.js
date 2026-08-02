import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Referral from '../models/Referral.js';

const generateToken = (id, role, name) => {
  return jwt.sign(
    { id, role, name },
    process.env.JWT_SECRET || 'super_secret_examos_jwt_key_2026',
    { expiresIn: '1d' }
  );
};

const generateRefreshToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_REFRESH_SECRET || 'super_secret_examos_refresh_key_2026',
    { expiresIn: '7d' }
  );
};

// Staff roles can only be assigned by an existing admin through the admin routes.
// Self-registration ALWAYS creates a regular 'User' — never a staff/privileged role.
const STAFF_ROLES = ['Super Admin', 'Content Manager', 'Support'];

export const register = async (name, email, password, role, agencyId, examId, referralCode, signupSource, agencies) => {
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
    referralCode: `REF${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    referredBy: referredBy || undefined,
    signupSource: signupSource || 'web',
  });

  if (referredBy) {
    const code = `REF${referredBy.toString().slice(-4).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`;
    await Referral.findOneAndUpdate(
      { user: referredBy },
      { $inc: { referralCount: 0 }, $setOnInsert: { code } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  const token = generateToken(user._id, user.role, user.name);
  const refreshToken = generateRefreshToken(user._id);

  return {
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
    },
    token,
    refreshToken,
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

  const otp = String(Math.floor(100000 + Math.random() * 900000));
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
      referralCode: `REF${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    });
  }

  user.otp = otp;
  user.otpExpires = expires;
  user.otpAttempts = 0;
  await user.save();

  // Dev/demo mode: OTP returned to caller (frontend shows it). In production,
  // an SMS gateway (e.g. MSG91/Twilio) would send this instead.
  return { phone, otp, expiresInSec: 600, devOtp: otp };
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
