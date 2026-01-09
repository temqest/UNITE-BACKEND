/**
 * Authentication Helper
 * Provides utilities for user authentication and JWT token generation
 */

const request = require('supertest');
const { signToken } = require('../../src/utils/jwt');
const { User } = require('../../src/models');

/**
 * Login a user and return JWT token
 * @param {Object} app - Express app instance
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<string>} JWT token
 */
async function loginUser(app, email, password) {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (response.status !== 200 || !response.body.success) {
    throw new Error(`Login failed: ${response.body.message || 'Unknown error'}`);
  }

  // Token might be in response body or cookie
  const token = response.body.token || response.body.data?.token;
  if (!token) {
    // Try to extract from Set-Cookie header
    const cookies = response.headers['set-cookie'];
    if (cookies) {
      const tokenCookie = cookies.find(c => c.startsWith('unite_user='));
      if (tokenCookie) {
        // Extract token from cookie (simplified - actual implementation may vary)
        return tokenCookie.split('=')[1].split(';')[0];
      }
    }
    throw new Error('No token found in login response');
  }

  return token;
}

/**
 * Generate JWT token for a user (bypasses login)
 * @param {string|ObjectId} userId - User ID
 * @param {string} email - User email
 * @returns {string} JWT token
 */
function getUserToken(userId, email) {
  return signToken({ id: userId.toString(), email });
}

/**
 * Get user ID from email
 * @param {string} email - User email
 * @returns {Promise<string>} User ID
 */
async function getUserIdByEmail(email) {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error(`User with email ${email} not found`);
  }
  return user._id.toString();
}

/**
 * Create Authorization header with Bearer token
 * @param {string} token - JWT token
 * @returns {Object} Headers object
 */
function createAuthHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Get authenticated user info
 * @param {Object} app - Express app instance
 * @param {string} token - JWT token
 * @returns {Promise<Object>} User info
 */
async function getAuthenticatedUser(app, token) {
  const response = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${token}`);

  if (response.status !== 200 || !response.body.success) {
    throw new Error(`Failed to get authenticated user: ${response.body.message || 'Unknown error'}`);
  }

  return response.body.data || response.body.user;
}

module.exports = {
  loginUser,
  getUserToken,
  getUserIdByEmail,
  createAuthHeaders,
  getAuthenticatedUser
};

