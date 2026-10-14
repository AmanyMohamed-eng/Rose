const rateLimit = require('express-rate-limit');

const handler = (message) => (req, res) => res.status(429).json({ success: false, message });

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many requests. Please try again later.'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: handler('Too many attempts. Try again later.'),
});

// Registration: count EVERY attempt (authLimiter skips successful requests, which left account-creation spam
// bounded only by the global limiter).
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: handler('Too many registrations from this address. Try again later.'),
});

// Per-account login throttle, independent of the client IP, so a distributed (many-IP) guessing attack on a
// single account is still slowed down. Only failed attempts are counted.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `login:${String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254)}`,
  handler: handler('Too many attempts for this account. Try again later.'),
});

/**
 * Per-authenticated-user limiter for endpoints that are costly (LLM calls) or spammy (support tickets).
 * Must run AFTER authenticate. Falls back to a shared bucket only if req.user is missing (never in practice).
 */
const userLimiter = ({ windowMs, limit, message }) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
    handler: handler(message),
  });

module.exports = { globalLimiter, authLimiter, registerLimiter, loginAccountLimiter, userLimiter };
