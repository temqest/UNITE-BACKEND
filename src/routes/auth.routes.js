const express = require('express');
const router = express.Router();
const { bloodbankStaffController } = require('../controller/users_controller');

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
    if (!req.body.username || !req.body.password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    await bloodbankStaffController.authenticateUser(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

