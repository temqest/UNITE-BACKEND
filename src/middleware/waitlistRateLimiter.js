const { RateLimiterMemory } = require('rate-limiter-flexible');

// Allow max 5 requests per IP every minute (60 seconds)
const waitlistRateLimiter = new RateLimiterMemory({
  points: 5,        // 5 requests
  duration: 60,     // Per 60 seconds
});

const waitlistLimiterMiddleware = (req, res, next) => {
  // Use IP address, fallback to a standard key if undefined
  const clientIdentifier = req.ip || req.connection.remoteAddress || 'unknown';

  waitlistRateLimiter.consume(clientIdentifier)
    .then((rateLimiterRes) => {
      // Allow request
      // Set rate limit headers if desired
      res.set('X-RateLimit-Limit', 5);
      res.set('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
      next();
    })
    .catch((rateLimiterRes) => {
      // Reject request
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.'
      });
    });
};

module.exports = waitlistLimiterMiddleware;
