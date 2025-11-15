const express = require('express');
const router = express.Router();
const { bloodbankStaffController, stakeholderController } = require('../controller/users_controller');
const authenticate = require('../middleware/authenticate');

// Note: For authentication, you may want to create specific validators
// For now, using basic validation

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user (login)
 * @access  Public
 */
router.post('/login', async (req, res, next) => {
  try {
    // Basic validation
    if (!req.body.email || !req.body.password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    await bloodbankStaffController.authenticateUser(req, res);
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
    await bloodbankStaffController.getCurrentUser(req, res);
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

module.exports = router;

/**
 * Stakeholder auth endpoints
 */
router.post('/stakeholders/login', async (req, res, next) => {
  try {
    if (!req.body.email || !req.body.password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    await stakeholderController.login(req, res);
  } catch (error) {
    next(error);
  }
});

