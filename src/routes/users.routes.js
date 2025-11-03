const express = require('express');
const router = express.Router();
const {
  systemAdminController,
  coordinatorController,
  bloodbankStaffController,
  stakeholderController
} = require('../controller/users_controller');

const authenticate = require('../middleware/authenticate');
const { requireAdmin, requireCoordinator } = require('../middleware/requireRoles');

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
router.put('/:userId/password', authenticate, async (req, res, next) => {
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
router.put('/:userId/reset-password', authenticate, requireAdmin, async (req, res, next) => {
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
router.get('/:userId', authenticate, async (req, res, next) => {
  try {
    await bloodbankStaffController.getUserById(req, res);
  } catch (error) {
    next(error);
  }
});

// Username-related endpoints removed (username no longer used)

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
router.get('/check-staff/:staffId', authenticate, async (req, res, next) => {
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
router.post('/admin', authenticate, requireAdmin, validateCreateSystemAdmin, async (req, res, next) => {
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
router.get('/admin/:adminId', authenticate, requireAdmin, async (req, res, next) => {
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
router.get('/admin', authenticate, requireAdmin, async (req, res, next) => {
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
router.put('/admin/:adminId', authenticate, requireAdmin, validateUpdateSystemAdmin, async (req, res, next) => {
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
router.get('/admin/:adminId/dashboard', authenticate, requireAdmin, async (req, res, next) => {
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
router.get('/admin/statistics', authenticate, requireAdmin, async (req, res, next) => {
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
router.delete('/admin/:adminId', authenticate, requireAdmin, async (req, res, next) => {
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
router.get('/admin/:adminId/coordinators', authenticate, requireAdmin, async (req, res, next) => {
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
router.post('/admin/:adminId/coordinators', authenticate, requireAdmin, validateCreateCoordinator, async (req, res, next) => {
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
router.get('/admin/:adminId/requests/attention', authenticate, requireAdmin, async (req, res, next) => {
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
router.post('/coordinators', authenticate, requireAdmin, validateCreateCoordinator, async (req, res, next) => {
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
router.get('/coordinators/:coordinatorId', authenticate, async (req, res, next) => {
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
router.get('/coordinators', authenticate, async (req, res, next) => {
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
router.put('/coordinators/:coordinatorId', authenticate, requireCoordinator, validateUpdateCoordinator, async (req, res, next) => {
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
router.get('/coordinators/:coordinatorId/dashboard', authenticate, requireCoordinator, async (req, res, next) => {
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
router.delete('/coordinators/:coordinatorId', authenticate, requireAdmin, async (req, res, next) => {
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
router.get('/coordinators/:coordinatorId/events/history', authenticate, requireCoordinator, async (req, res, next) => {
// Registration code management (Coordinator only)
router.post('/coordinators/:coordinatorId/registration-codes', authenticate, requireCoordinator, async (req, res, next) => {
  try {
    await coordinatorController.createRegistrationCode(req, res);
  } catch (error) {
    next(error);
  }
});

router.get('/coordinators/:coordinatorId/registration-codes', authenticate, requireCoordinator, async (req, res, next) => {
  try {
    await coordinatorController.listRegistrationCodes(req, res);
  } catch (error) {
    next(error);
  }
});
  try {
    await coordinatorController.getCoordinatorEventHistory(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== STAKEHOLDER ROUTES ====================

/**
 * @route   POST /api/stakeholders/register
 * @desc    Register stakeholder (optionally via registration code)
 * @access  Public or Coordinator (depending on flow)
 */
router.post('/stakeholders/register', async (req, res, next) => {
  try {
    await stakeholderController.register(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


