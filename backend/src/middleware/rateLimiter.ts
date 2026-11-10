// ============================================================
// CampusSarthi — Rate Limiters
// ============================================================

import rateLimit from 'express-rate-limit';

/**
 * Auth routes: 50 requests per 15 minutes per IP.
 * Prevents brute-force login attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  skipSuccessfulRequests: false,
});

/**
 * General API: 100 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.',
  },
  skipSuccessfulRequests: true,
});

/**
 * LMS operations: 20 requests per 5 minutes per IP.
 * LMS scraping is expensive and rate-limited on the LMS side too.
 */
export const lmsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'LMS operations are limited. Please wait before retrying.',
  },
  skipSuccessfulRequests: false,
});
