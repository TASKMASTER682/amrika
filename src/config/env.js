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
export const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export const rateLimit = {
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 300,
};