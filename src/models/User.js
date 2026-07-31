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
    enum: ['Super Admin', 'User'],
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
