import { rateLimit as rateLimitConfig, authRateLimit } from '../config/env.js';

// Simple in-memory sliding-window rate limiter keyed by client IP.
const buckets = new Map();

const now = () => Date.now();

// Returns true if allowed; if blocked, sends the 429 and returns false.
const hit = (key, windowMs, max, res, message) => {
  const entry = buckets.get(key);
  if (!entry || entry.resetAt <= now()) {
    buckets.set(key, { count: 1, resetAt: now() + windowMs });
    return true;
  }
  entry.count += 1;
  if (entry.count > max) {
    res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now()) / 1000)));
    res.status(429).json({ success: false, statusCode: 429, message });
    return false;
  }
  return true;
};

const clientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = forwardedFor.split(',').map((ip) => ip.trim());
    if (ips[0]) return ips[0];
  }
  return req.headers['x-real-ip'] || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
};


const limiter = ({ windowMs, max, message }) => (req, res, next) => {
  if (!hit(clientIp(req), windowMs, max, res, message)) return;
  next();
};

/** General API limiter — generous enough for normal use, blocks scraping/abuse. */
export const apiLimiter = limiter({
  windowMs: rateLimitConfig.windowMs,
  max: rateLimitConfig.max,
  message: 'Too many requests, please try again later',
});

const resolveIdentifier = (req) => {
  const body = req.body || {};
  return String(body.email || body.phone || body.mobile || '').trim().toLowerCase() || 'anon';
};

/**
 * Tighter limiter for credential endpoints. Every request counts toward BOTH:
 *   - `${ip}:${identifier}`  → that user's own attempts (20/15min by default)
 *   - `${ip}:*`              → all auth attempts from that IP (100/15min by default)
 * Credential-stuffing from one IP is still slowed down, but a single real user's
 * failed attempts can never lock out the website (important behind a reverse
 * proxy where every user would otherwise share the same IP).
 */
export const authLimiter = (req, res, next) => {
  const ip = clientIp(req);
  const id = resolveIdentifier(req);
  const { windowMs, maxPerIdentifier, maxPerIp, message } = authRateLimit;
  if (!hit(`${ip}:${id}`, windowMs, maxPerIdentifier, res, message)) return;
  if (!hit(`${ip}:*`, windowMs, maxPerIp, res, message)) return;
  next();
};

/** Forget the buckets for an identifier — call right after a successful auth so a
 *  legit user who mistyped a few times isn't stuck waiting for the window to lapse. */
export const clearAuthBuckets = (req, identifier) => {
  const ip = clientIp(req);
  const id = (identifier || resolveIdentifier(req)).trim().toLowerCase();
  buckets.delete(`${ip}:${id}`);
  buckets.delete(`${ip}:*`);
};

// Periodic cleanup so the map never leaks after traffic stops.
const sweep = setInterval(() => {
  const nowAt = now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= nowAt) buckets.delete(key);
  }
}, 60 * 1000);
sweep.unref();