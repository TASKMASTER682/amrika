import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['Super Admin', 'Content Manager', 'Support', 'User'],
    default: 'User',
  },
  active: {
    type: Boolean,
    default: true,
  },
  primaryAgency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agency',
  },
  primaryExam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
  },
  agencies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agency',
  }],
  exams: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
  }],
  refreshTokenVersion: {
    type: Number,
    default: 0,
  },
  lastActiveAt: Date,
  signupSource: { type: String, default: 'web' },
  referralCode: { type: String, unique: true, sparse: true, uppercase: true },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  // Phone / OTP auth (India market) — optional, enabled later
  phone: { type: String, sparse: true, trim: true },
  phoneVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  otpAttempts: { type: Number, default: 0 },
  subscription: {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    startedAt: Date,
    expiresAt: Date,
    status: { type: String, enum: ['none', 'active', 'expired'], default: 'none' },
  },
  // Gamification
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  streak: { type: Number, default: 0 },
  bestStreak: { type: Number, default: 0 },
  lastActiveDay: Date,
  badges: [{
    code: { type: String },
    name: { type: String },
    earnedAt: { type: Date, default: Date.now },
  }],
}, {
  timestamps: true,
});

// Pre-save password hashing
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model('User', userSchema);
