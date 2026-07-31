import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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

export const register = async (name, email, password, role, agencyId, examId) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error('A user with this email address already exists.');
    error.statusCode = 409;
    error.code = 'USER_EXISTS';
    throw error;
  }

  const user = await User.create({
    name,
    email,
    password,
    role: role === 'Super Admin' ? 'Super Admin' : 'User',
    primaryAgency: agencyId || undefined,
    primaryExam: examId || undefined,
  });

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

  const token = generateToken(user._id, user.role, user.name);
  const refreshToken = generateRefreshToken(user._id);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
    refreshToken,
  };
};
