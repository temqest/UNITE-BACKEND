const { RateLimiterMemory } = require('rate-limiter-flexible');

// Pure in-memory rate limiting configuration (no Redis required)
// NOTE: `points` = number of allowed events (requests) per `duration` seconds.
// E.g. with GENERAL_POINTS = 100 and GENERAL_DURATION = 900 (15 minutes):
//   - Each IP can make 100 requests per 900 seconds (15 minutes).
//   - That equals ~6.66 requests per minute on average.
// For fast local testing you can set e.g. RL_GENERAL_POINTS=5 and RL_GENERAL_DURATION=10
// to allow 5 requests every 10 seconds.
const GENERAL_POINTS = parseInt(process.env.RL_GENERAL_POINTS, 10) || 100;
const GENERAL_DURATION = parseInt(process.env.RL_GENERAL_DURATION, 10) || 60 * 15; // seconds (default 900s)

// AUTH limits are intentionally stricter (shorter window and fewer points)
// Default: AUTH_POINTS = 5, AUTH_DURATION = 60 -> 5 login attempts per 60 seconds.
// Example: to allow 3 attempts every 30s set RL_AUTH_POINTS=3 and RL_AUTH_DURATION=30
const AUTH_POINTS = parseInt(process.env.RL_AUTH_POINTS, 10) || 5;
const AUTH_DURATION = parseInt(process.env.RL_AUTH_DURATION, 10) || 60; // seconds (default 60s)

const generalLimiter = new RateLimiterMemory({
  points: GENERAL_POINTS,
  duration: GENERAL_DURATION
});

const authLimiter = new RateLimiterMemory({
  points: AUTH_POINTS,
  duration: AUTH_DURATION
});

const sendRateLimitExceeded = (res, msBeforeNext) => {
  try {
    // `msBeforeNext` is milliseconds until the limiter allows the next point.
    // We set the standard `Retry-After` header (seconds) so clients know when
    // to retry. If `msBeforeNext` is not provided, the header may be omitted.
    res.set('Retry-After', Math.ceil(msBeforeNext / 1000));
  } catch (e) {}
  return res.status(429).json({ success: false, message: 'Too many requests, please try again later.' });
};

module.exports = {
  general: async (req, res, next) => {
    try {
      const key = req.ip || req.connection.remoteAddress || 'anon';
      await generalLimiter.consume(key);
      return next();
    } catch (rej) {
      const ms = (rej && rej.msBeforeNext) ? rej.msBeforeNext : 0;
      return sendRateLimitExceeded(res, ms);
    }
  },

  auth: async (req, res, next) => {
    try {
      // For auth, we usually use IP-based limits; could combine with username
      const key = req.ip || req.connection.remoteAddress || 'anon';
      await authLimiter.consume(key);
      return next();
    } catch (rej) {
      const ms = (rej && rej.msBeforeNext) ? rej.msBeforeNext : 0;
      return sendRateLimitExceeded(res, ms);
    }
  },

  // no redis client: pure in-memory implementation
  _inMemory: true
};
