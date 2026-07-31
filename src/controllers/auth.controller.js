const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const ApiResponse = require('../utils/ApiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const config = require('../config/env');

const REFRESH_COOKIE_NAME = 'examos_refresh';
const refreshCookieOptions = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/api/auth', // only sent to auth routes — narrows exposure if it ever leaks
};

function issueTokens(user, res) {
  const claims = { sub: user._id.toString(), role: user.role, tokenVersion: user.refreshTokenVersion || 0 };
  const accessToken = signAccessToken(claims);
  const refreshToken = signRefreshToken(claims);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
  return accessToken;
}

function toSafeJSON(user) {
  const obj = user.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
}

const register = asyncHandler(async (req, res) => {
  const { name, email, password, agencies, exams } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const user = await User.create({
    name, email, password,
    role: 'User',
    agencies: Array.isArray(agencies) ? agencies : [],
    exams: Array.isArray(exams) ? exams : [],
  });
  const accessToken = issueTokens(user, res);

  new ApiResponse(201, { user: toSafeJSON(user), accessToken }, 'Account created').send(res);
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.active) throw ApiError.forbidden('This account has been deactivated');

  user.lastActiveAt = new Date();
  await user.save();

  const accessToken = issueTokens(user, res);
  new ApiResponse(200, { user: toSafeJSON(user), accessToken }, 'Logged in').send(res);
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) throw ApiError.unauthorized('Missing refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw ApiError.unauthorized('Account not found or deactivated');

  // A stale refresh token version means logout-all-devices was triggered
  // since this token was issued (e.g. password change) — reject it.
  if (user.refreshTokenVersion !== payload.tokenVersion) {
    throw ApiError.unauthorized('Refresh token has been revoked');
  }

  const accessToken = issueTokens(user, res);
  new ApiResponse(200, { accessToken }, 'Token refreshed').send(res);
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  new ApiResponse(200, null, 'Logged out').send(res);
});

/** Invalidates every refresh token currently issued to this user. */
const logoutAllDevices = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { $inc: { refreshTokenVersion: 1 } });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
  new ApiResponse(200, null, 'Logged out of all devices').send(res);
});

const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');
  new ApiResponse(200, { user: toSafeJSON(user) }).send(res);
});

const updatePreferences = asyncHandler(async (req, res) => {
  const { agencies, exams } = req.body;
  const update = {};
  if (Array.isArray(agencies)) update.agencies = agencies;
  if (Array.isArray(exams)) update.exams = exams;
  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true });
  if (!user) throw ApiError.notFound('User not found');
  new ApiResponse(200, { user: toSafeJSON(user) }, 'Preferences updated').send(res);
});

module.exports = { register, login, refresh, logout, logoutAllDevices, me, updatePreferences };
