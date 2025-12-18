const express = require('express');
const router = express.Router();
const { userController } = require('../controller/users_controller');

const registrationCodeService = require('../services/users_services/registrationCode.service');
const { Location } = require('../models/index');

const authenticate = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/requirePermission');
const { requireStaffManagement } = require('../middleware/requireStaffManagement');

const { validateCreateUser, validateUpdateUser } = require('../validators/users_validators/user.validators');

// ==================== AUTHENTICATION & PROFILE ====================

/**
 * @route   GET /api/users/check-email/:email
 * @desc    Check if email is available
 * @access  Public
 */
router.get('/users/check-email/:email', async (req, res, next) => {
  try {
    const { User } = require('../models');
    const { email } = req.params;
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    return res.status(200).json({
      success: true,
      available: !existingUser
    });
  } catch (error) {
    next(error);
  }
});

// ==================== UNIFIED USER ROUTES ====================

/**
 * @route   GET /api/users
 * @desc    List users (unified user model)
 * @access  Private (requires user.read permission)
 */
router.get('/users', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userController.listUsers(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId
 * @desc    Get user by ID (unified model)
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userController.getUserById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users
 * @desc    Create a new user (unified model with RBAC)
 * @access  Private (requires staff.create permission with appropriate staff type)
 */
router.post('/users', authenticate, requireStaffManagement('create', 'staffType'), validateCreateUser, async (req, res, next) => {
  try {
    // Check if requested staff type is allowed
    const requestedStaffType = req.body.roles?.[0] || req.body.staffType;
    const allowedTypes = req.allowedStaffTypes || [];
    
    if (requestedStaffType && allowedTypes.length > 0 && !allowedTypes.includes('*')) {
      if (!allowedTypes.includes(requestedStaffType)) {
        return res.status(403).json({
          success: false,
          message: `Cannot create staff of type '${requestedStaffType}'. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
    }
    
    await userController.createUser(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId
 * @desc    Update user (unified model)
 * @access  Private (requires staff.update permission with appropriate staff type)
 */
router.put('/users/:userId', authenticate, requireStaffManagement('update', 'staffType'), validateUpdateUser, async (req, res, next) => {
  try {
    // Check if updating staff type and if it's allowed
    const requestedStaffType = req.body.roles?.[0] || req.body.staffType;
    const allowedTypes = req.allowedStaffTypes || [];
    
    if (requestedStaffType && allowedTypes.length > 0 && !allowedTypes.includes('*')) {
      if (!allowedTypes.includes(requestedStaffType)) {
        return res.status(403).json({
          success: false,
          message: `Cannot update user to staff type '${requestedStaffType}'. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
    }
    
    await userController.updateUser(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/users/:userId
 * @desc    Delete user (unified model)
 * @access  Private (requires staff.delete permission)
 */
router.delete('/users/:userId', authenticate, requireStaffManagement('delete'), async (req, res, next) => {
  try {
    await userController.deleteUser(req, res);
  } catch (error) {
    next(error);
  }
});

// Public validation endpoint for registration codes (used by signup flow)
router.get('/registration-codes/validate', async (req, res, next) => {
  try {
    const { code } = req.query || {};
    if (!code) return res.status(400).json({ success: false, message: 'Code query param is required' });

    const result = await registrationCodeService.validate(String(code));
    const reg = result.code;
    // Try to get location info if available
    let locationInfo = null;
    if (reg.locationId) {
      const location = await Location.findById(reg.locationId);
      if (location) {
        locationInfo = { name: location.name, type: location.type };
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        Code: reg.Code,
        coordinatorId: reg.Coordinator_ID || reg.coordinatorId,
        locationId: reg.locationId,
        locationInfo: locationInfo
      }
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Invalid or expired code' });
  }
});

module.exports = router;


