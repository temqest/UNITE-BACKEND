// Temporarily disabled rate limiter for development/testing.
// To re-enable, restore from `rateLimiter.js.bak` or revert this file.

module.exports = {
  general: (req, res, next) => {
    return next();
  },

  auth: (req, res, next) => {
    return next();
  },

  // Marked as disabled so other code can detect state if needed
  _disabled: true
};
