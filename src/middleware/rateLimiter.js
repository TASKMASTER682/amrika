const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/** General API limiter — generous enough for normal use, blocks scraping/abuse. */
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: 'Too many requests, please try again later' },
});

/** Tighter limiter for auth routes specifically, to slow down credential stuffing. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, statusCode: 429, message: 'Too many auth attempts, please try again later' },
});

module.exports = { apiLimiter, authLimiter };
