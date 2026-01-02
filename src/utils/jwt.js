const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// Default token expiration: 30 minutes (configurable via JWT_EXPIRES_IN env var)
// Shorter expiration improves security - tokens should be refreshed or re-validated
const DEFAULT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30m';

/**
 * Sign a JWT token with minimal payload
 * Token should only contain id and email - role and permissions fetched from server
 * @param {Object} payload - Token payload (should only contain id and email)
 * @param {Object} options - Signing options
 * @returns {string} Signed JWT token
 */
function signToken(payload, options = {}) {
  // Ensure payload only contains minimal data
  const minimalPayload = {
    id: payload.id,
    email: payload.email
  };
  
  return jwt.sign(minimalPayload, JWT_SECRET, { 
    expiresIn: options.expiresIn || DEFAULT_EXPIRES_IN 
  });
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };


