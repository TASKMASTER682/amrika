import { rateLimit as rateLimitConfig } from '../config/env.js';

// Simple in-memory sliding-window rate limiter keyed by client IP.
const buckets = new Map();

const limiter = ({ windowMs, max, message }) => (req, res, next) => {
  const key = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  entry.count += 1;
  if (entry.count > max) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ success: false, statusCode: 429, message });
  }
  next();
};

/** General API limiter — generous enough for normal use, blocks scraping/abuse. */
export const apiLimiter = limiter({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.max,
  message: 'Too many requests, please try again later',
});

/** Tighter limiter for auth routes to slow down credential stuffing. */
export const authLimiter = limiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many auth attempts, please try again later',
});

// Periodic cleanup so the map never leaks after traffic stops.
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000);
sweep.unref();