const express = require('express');
const router = express.Router();
const {
  systemAdminController,
  coordinatorController,
  bloodbankStaffController
} = require('../controller/users_controller');

const {
  validateCreateBloodbankStaff,
  validateUpdateBloodbankStaff
} = require('../validators/users_validators/bloodbank_users.validators');

const {
  validateCreateSystemAdmin,
  validateUpdateSystemAdmin
} = require('../validators/users_validators/systemAdmin.validators');

const {
  validateCreateCoordinator,
  validateUpdateCoordinator
} = require('../validators/users_validators/coordinator.validators');

// ==================== AUTHENTICATION & PROFILE ====================

/**
 * @route   POST /api/users/verify-password
 * @desc    Verify password for a user
 * @access  Private
 */
router.post('/:userId/verify-password', async (req, res, next) => {
  try {
    await bloodbankStaffController.verifyPassword(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId/password
 * @desc    Change user password
 * @access  Private
 */
router.put('/:userId/password', async (req, res, next) => {
  try {
    await bloodbankStaffController.changePassword(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId/reset-password
 * @desc    Reset password (admin operation)
 * @access  Private (Admin only)
 */
router.put('/:userId/reset-password', async (req, res, next) => {
  try {
    await bloodbankStaffController.resetPassword(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId
 * @desc    Get user by ID
 * @access  Private
 */
router.get('/:userId', async (req, res, next) => {
  try {
    await bloodbankStaffController.getUserById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/username/:username
 * @desc    Get user by username
 * @access  Private
 */
router.get('/username/:username', async (req, res, next) => {
  try {
    await bloodbankStaffController.getUserByUsername(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/check-username/:username
 * @desc    Check if username is available
 * @access  Public
 */
router.get('/check-username/:username', async (req, res, next) => {
  try {
    await bloodbankStaffController.isUsernameAvailable(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/check-email/:email
 * @desc    Check if email is available
 * @access  Public
 */
router.get('/check-email/:email', async (req, res, next) => {
  try {
    await bloodbankStaffController.isEmailAvailable(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/:userId/profile', validateUpdateBloodbankStaff, async (req, res, next) => {
  try {
    await bloodbankStaffController.updateProfile(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/full-name
 * @desc    Get full name of user
 * @access  Private
 */
router.get('/:userId/full-name', async (req, res, next) => {
  try {
    await bloodbankStaffController.getFullName(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/search
 * @desc    Search users by name or username
 * @access  Private
 */
router.get('/search', async (req, res, next) => {
  try {
    await bloodbankStaffController.searchUsers(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/check-staff/:staffId
 * @desc    Check if staff ID exists
 * @access  Private
 */
router.get('/check-staff/:staffId', async (req, res, next) => {
  try {
    await bloodbankStaffController.staffExists(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== SYSTEM ADMIN ROUTES ====================

/**
 * @route   POST /api/admin
 * @desc    Create a new system admin account
 * @access  Private (Admin only)
 */
router.post('/admin', validateCreateSystemAdmin, async (req, res, next) => {
  try {
    await systemAdminController.createSystemAdminAccount(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/:adminId
 * @desc    Get admin by ID
 * @access  Private (Admin only)
 */
router.get('/admin/:adminId', async (req, res, next) => {
  try {
    await systemAdminController.getAdminById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin
 * @desc    Get all admins
 * @access  Private (Admin only)
 */
router.get('/admin', async (req, res, next) => {
  try {
    await systemAdminController.getAllAdmins(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/admin/:adminId
 * @desc    Update admin information
 * @access  Private (Admin only)
 */
router.put('/admin/:adminId', validateUpdateSystemAdmin, async (req, res, next) => {
  try {
    await systemAdminController.updateAdmin(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/:adminId/dashboard
 * @desc    Get admin dashboard
 * @access  Private (Admin only)
 */
router.get('/admin/:adminId/dashboard', async (req, res, next) => {
  try {
    await systemAdminController.getAdminDashboard(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/statistics
 * @desc    Get system-wide statistics
 * @access  Private (Admin only)
 */
router.get('/admin/statistics', async (req, res, next) => {
  try {
    await systemAdminController.getSystemStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/admin/:adminId
 * @desc    Delete admin account
 * @access  Private (Admin only)
 */
router.delete('/admin/:adminId', async (req, res, next) => {
  try {
    await systemAdminController.deleteAdmin(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/:adminId/coordinators
 * @desc    Get managed coordinators
 * @access  Private (Admin only)
 */
router.get('/admin/:adminId/coordinators', async (req, res, next) => {
  try {
    await systemAdminController.getManagedCoordinators(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/admin/:adminId/coordinators
 * @desc    Create coordinator account
 * @access  Private (Admin only)
 */
router.post('/admin/:adminId/coordinators', validateCreateCoordinator, async (req, res, next) => {
  try {
    await systemAdminController.createCoordinatorAccount(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/admin/:adminId/requests/attention
 * @desc    Get requests requiring admin attention
 * @access  Private (Admin only)
 */
router.get('/admin/:adminId/requests/attention', async (req, res, next) => {
  try {
    await systemAdminController.getRequestsRequiringAttention(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== COORDINATOR ROUTES ====================

/**
 * @route   POST /api/coordinators
 * @desc    Create a new coordinator account
 * @access  Private (Admin only)
 */
router.post('/coordinators', validateCreateCoordinator, async (req, res, next) => {
  try {
    await coordinatorController.createCoordinatorAccount(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/coordinators/:coordinatorId
 * @desc    Get coordinator by ID
 * @access  Private
 */
router.get('/coordinators/:coordinatorId', async (req, res, next) => {
  try {
    await coordinatorController.getCoordinatorById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/coordinators
 * @desc    Get all coordinators with filtering and pagination
 * @access  Private
 */
router.get('/coordinators', async (req, res, next) => {
  try {
    await coordinatorController.getAllCoordinators(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/coordinators/:coordinatorId
 * @desc    Update coordinator information
 * @access  Private (Admin or Coordinator)
 */
router.put('/coordinators/:coordinatorId', validateUpdateCoordinator, async (req, res, next) => {
  try {
    await coordinatorController.updateCoordinator(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/coordinators/:coordinatorId/dashboard
 * @desc    Get coordinator dashboard
 * @access  Private (Coordinator)
 */
router.get('/coordinators/:coordinatorId/dashboard', async (req, res, next) => {
  try {
    await coordinatorController.getCoordinatorDashboard(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/coordinators/:coordinatorId
 * @desc    Delete/deactivate coordinator account
 * @access  Private (Admin only)
 */
router.delete('/coordinators/:coordinatorId', async (req, res, next) => {
  try {
    await coordinatorController.deleteCoordinator(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/coordinators/:coordinatorId/events/history
 * @desc    Get coordinator event history
 * @access  Private (Coordinator)
 */
router.get('/coordinators/:coordinatorId/events/history', async (req, res, next) => {
  try {
    await coordinatorController.getCoordinatorEventHistory(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

