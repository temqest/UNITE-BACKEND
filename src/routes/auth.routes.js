const express = require('express');
const router = express.Router();
const { userController } = require('../controller/users_controller');
const authenticate = require('../middleware/authenticate');
const rateLimiter = require('../middleware/rateLimiter');

// Note: For authentication, you may want to create specific validators
// For now, using basic validation

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user (login)
 * @access  Public
 */
router.post('/login', rateLimiter.auth, async (req, res, next) => {
  try {
    // Basic validation
    if (!req.body.email || !req.body.password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    await userController.authenticateUser(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/auth/refresh
 * @desc  Refresh access token
 * @access Private (requires valid token)
 */
router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    await userController.refreshToken(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/auth/me
 * @desc  Get current authenticated user info
 * @access Private
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    await userController.getCurrentUser(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/auth/logout
 * @desc  Logout user by clearing auth cookies
 * @access Public (works with cookie-based sessions)
 */
router.post('/logout', async (req, res, next) => {
  try {
    // If session or cookies are used, clear them.
    try {
      res.clearCookie('unite_token', { path: '/' });
      res.clearCookie('unite_user', { path: '/' });
      res.clearCookie('connect.sid', { path: '/' });
    } catch (e) {
      // ignore cookie clear errors
    }

    // If you have server-side sessions, destroy them here
    try {
      if (req.session && typeof req.session.destroy === 'function') {
        req.session.destroy(() => {});
      }
    } catch (e) {}

    return res.status(200).json({ success: true, message: 'Logged out' });
  } catch (error) {
    next(error);
  }
});

// Password activation endpoints
const locationService = require('../services/utility_services/location.service');

/**
 * @route GET /api/auth/activate-account
 * @desc  Verify activation token and return user info
 * @access Public
 */
router.get('/activate-account', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Activation token is required' });
    }
    
    const result = await locationService.verifyActivationToken(token);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * @route POST /api/auth/activate-account
 * @desc  Set password and activate account
 * @access Public
 */
router.post('/activate-account', async (req, res, next) => {
  try {
    const { token, password, confirmPassword } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, message: 'Activation token is required' });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    
    const result = await locationService.activateAccount(token, password);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;

