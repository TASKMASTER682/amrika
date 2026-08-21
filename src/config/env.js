/**
 * Centralized environment configuration (ESM).
 * Single place to read process.env so local and production behave identically.
 */
import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}. Set them in backend/.env`
  );
}

const clientUrls = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

export const CLIENT_URLS = clientUrls;
export const CLIENT_URL = clientUrls[0] || 'http://localhost:3000';
export const env = process.env.NODE_ENV || 'development';
export const port = Number(process.env.PORT) || 5000;

// JWT secrets (JWT_ACCESS_SECRET is preferred; JWT_SECRET is a compat alias).
export const accessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
export const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
export const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
// 30-day refresh window keeps users logged in for at least ~20 days of active use.
export const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

export const rateLimit = {
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 1000,
};

// Auth-limiter limits. Buckets are keyed per (client IP + attempted email/phone),
// with a separate cap per IP, so one user's failed attempts never block the whole
// site (fixes the reverse-proxy collapse where every user shares the proxy IP).
export const authRateLimit = {
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  maxPerIdentifier: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  maxPerIp: Number(process.env.AUTH_RATE_LIMIT_IP_MAX) || 150,
  message: 'Too many auth attempts, please try again later',
};

// Google OAuth
export const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
export const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
export const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || '';

// Allowed email domains for registration
export const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const isValidEmailDomain = (email) => {
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  return domain ? allowedEmailDomains.includes(domain) : false;
};

// Email verification — the link expires after this window. Unverified accounts
// whose window has elapsed are deleted by the cleanup job in src/jobs/.
export const emailVerificationExpiresMs = Number(process.env.EMAIL_VERIFICATION_EXPIRES_MS) || 10 * 60 * 1000;