import helmet from 'helmet';
import cors from 'cors';
import { CLIENT_URLS } from '../config/env.js';

// Recursively removes keys starting with '$' or containing '.' to block
// MongoDB query/projection operator injection ($where, __proto__, etc.).
const clean = (value, key) => {
  if (key && (key.startsWith('$') || key.includes('.'))) return undefined;
  if (Array.isArray(value)) return value.map((v) => clean(v));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      const cleaned = clean(value[k], k);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
};

export const sanitizeMongo = (req, res, next) => {
  ['body', 'query', 'params'].forEach((source) => {
    if (req[source]) req[source] = clean(req[source]);
  });
  next();
};

/**
 * Baseline security middleware for every request.
 * Order matters: helmet headers first, CORS, then operator-injection sanitizer.
 */
export const applySecurity = (app) => {
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (curl, server-to-server, same-origin) → allow.
        if (!origin) return callback(null, true);
        if (CLIENT_URLS.includes(origin)) return callback(null, true);
        // `false` tells cors to respond 403 without leaking error internals.
        return callback(null, false);
      },
      credentials: true, // required for the httpOnly refresh-token cookie
    })
  );
  app.use(sanitizeMongo);
};