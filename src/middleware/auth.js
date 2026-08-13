import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { accessSecret } from '../config/env.js';
import { hasActiveSubscription } from '../services/AccessService.js';

const getToken = (req) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }
  return null;
};

// Base middleware: verifies the JWT and loads the user into req.user.
const authenticate = async (req, res, next) => {
  const token = getToken(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, accessSecret);
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.active) return null;
    req.user = user;
    return user;
  } catch {
    return null;
  }
};

/** Strict auth: rejects the request when no valid token is present. */
export const protect = async (req, res, next) => {
  const user = await authenticate(req, res, next);
  if (!user) {
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Access denied. No valid authentication token provided.',
    });
  }
  next();
};

/** Optional auth: attaches req.user when a valid token is present, but never rejects. */
export const optionalProtect = async (req, res, next) => {
  const user = await authenticate(req, res, next);
  if (!user) return next(); // anonymous request (or invalid token) — proceed without a user
  next();
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        code: 'FORBIDDEN',
        message: `Role '${req.user?.role || 'Guest'}' is not authorized to access this resource.`,
      });
    }
    next();
  };
};

/** Premium gate: only users with an active paid subscription may proceed. */
export const requireSubscription = (req, res, next) => {
  if (hasActiveSubscription(req.user)) return next();
  return res.status(403).json({
    success: false,
    code: 'SUBSCRIPTION_REQUIRED',
    message: 'This feature is available to members only. Please upgrade your plan to unlock it.',
  });
};