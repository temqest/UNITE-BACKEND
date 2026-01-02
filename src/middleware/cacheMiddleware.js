/**
 * Response Caching Middleware
 * 
 * Caches GET endpoint responses with ETag support and proper invalidation
 */

const crypto = require('crypto');

// In-memory cache store
// In production, consider using Redis or similar
const cacheStore = new Map();

// Default TTLs (in milliseconds)
const DEFAULT_TTL = {
  list: 30 * 1000,      // 30 seconds for list endpoints
  detail: 5 * 60 * 1000 // 5 minutes for detail endpoints
};

/**
 * Generate cache key from request
 * @param {Object} req - Express request object
 * @returns {string} Cache key
 */
function generateCacheKey(req) {
  const userId = req.user?._id || req.user?.id || 'anonymous';
  const path = req.path;
  const query = JSON.stringify(req.query);
  return `${userId}:${path}:${query}`;
}

/**
 * Generate ETag from response data
 * @param {any} data - Response data
 * @returns {string} ETag value
 */
function generateETag(data) {
  const dataString = JSON.stringify(data);
  return crypto.createHash('md5').update(dataString).digest('hex');
}

/**
 * Cache middleware factory
 * @param {Object} options - Cache options
 * @param {number} options.ttl - Time to live in milliseconds
 * @param {boolean} options.etag - Enable ETag support
 * @returns {Function} Express middleware
 */
function cacheMiddleware(options = {}) {
  const ttl = options.ttl || DEFAULT_TTL.list;
  const enableETag = options.etag !== false; // Default to true

  return (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    const cacheKey = generateCacheKey(req);
    const cached = cacheStore.get(cacheKey);

    // Check if cache entry exists and is still valid
    if (cached && cached.expiresAt > Date.now()) {
      // Check ETag if client sent If-None-Match header
      if (enableETag && req.headers['if-none-match']) {
        if (req.headers['if-none-match'] === cached.etag) {
          // Resource not modified
          return res.status(304).end();
        }
      }

      // Return cached response
      if (enableETag && !res.getHeader('ETag')) {
        res.setHeader('ETag', cached.etag);
      }
      return res.status(200).json(cached.data);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function(data) {
      // Generate ETag
      const etag = enableETag ? generateETag(data) : null;

      // Cache the response
      cacheStore.set(cacheKey, {
        data,
        etag,
        expiresAt: Date.now() + ttl
      });

      // Set ETag header
      if (enableETag && etag) {
        res.setHeader('ETag', etag);
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache for a specific user or pattern
 * @param {string|RegExp} pattern - Cache key pattern or user ID
 */
function invalidateCache(pattern) {
  if (typeof pattern === 'string') {
    // Invalidate all entries for a user
    const userPattern = new RegExp(`^${pattern}:`);
    for (const key of cacheStore.keys()) {
      if (userPattern.test(key)) {
        cacheStore.delete(key);
      }
    }
  } else if (pattern instanceof RegExp) {
    // Invalidate entries matching regex
    for (const key of cacheStore.keys()) {
      if (pattern.test(key)) {
        cacheStore.delete(key);
      }
    }
  }
}

/**
 * Clear all cache entries
 */
function clearCache() {
  cacheStore.clear();
}

/**
 * Cleanup expired cache entries (should be called periodically)
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, value] of cacheStore.entries()) {
    if (value.expiresAt <= now) {
      cacheStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

module.exports = {
  cacheMiddleware,
  invalidateCache,
  clearCache,
  cleanupExpiredEntries
};

