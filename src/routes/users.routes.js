const express = require('express');
const router = express.Router();
const {
  systemAdminController,
  coordinatorController,
  bloodbankStaffController,
  stakeholderController
} = require('../controller/users_controller');

const registrationCodeService = require('../services/users_services/registrationCode.service');
const { District } = require('../models/index');

const authenticate = require('../middleware/authenticate');
const { requireAdmin, requireCoordinator, requireAdminOrCoordinator } = require('../middleware/requireRoles'); // Legacy - kept for backward compatibility
const { requirePermission, requireAnyPermission } = require('../middleware/requirePermission');

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
router.post('/users/:userId/verify-password', async (req, res, next) => {
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
router.put('/users/:userId/password', authenticate, async (req, res, next) => {
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
router.put('/users/:userId/reset-password', authenticate, requirePermission('user', 'update'), async (req, res, next) => {
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
router.get('/users/:userId', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
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
router.get('/users/check-email/:email', async (req, res, next) => {
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
router.put('/users/:userId/profile', validateUpdateBloodbankStaff, async (req, res, next) => {
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
router.get('/users/:userId/full-name', async (req, res, next) => {
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
router.get('/users/search', async (req, res, next) => {
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
router.get('/users/check-staff/:staffId', authenticate, async (req, res, next) => {
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
router.post('/admin', authenticate, requirePermission('user', 'create'), validateCreateSystemAdmin, async (req, res, next) => {
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
router.get('/admin/:adminId', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
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
router.get('/admin', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
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
router.put('/admin/:adminId', authenticate, requirePermission('user', 'update'), validateUpdateSystemAdmin, async (req, res, next) => {
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
router.get('/admin/:adminId/dashboard', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
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
router.get('/admin/statistics', authenticate, requirePermission('system', 'audit'), async (req, res, next) => {
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
router.delete('/admin/:adminId', authenticate, requirePermission('user', 'delete'), async (req, res, next) => {
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
router.get('/admin/:adminId/coordinators', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
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
router.post('/admin/:adminId/coordinators', authenticate, requirePermission('user', 'create'), async (req, res, next) => {
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
router.get('/admin/:adminId/requests/attention', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
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
router.post('/coordinators', authenticate, requirePermission('user', 'create'), async (req, res, next) => {
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
 * @access  Private (Admin only)
 */
router.put('/coordinators/:coordinatorId', authenticate, requirePermission('user', 'update'), validateUpdateCoordinator, async (req, res, next) => {
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
router.get('/coordinators/:coordinatorId/dashboard', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
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
router.delete('/coordinators/:coordinatorId', authenticate, requirePermission('user', 'delete'), async (req, res, next) => {
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
router.get('/coordinators/:coordinatorId/events/history', authenticate, requirePermission('event', 'read'), async (req, res, next) => {
  try {
    await coordinatorController.getCoordinatorEventHistory(req, res);
  } catch (error) {
    next(error);
  }
});

// Registration code management (Coordinator or Admin)
router.post('/coordinators/:coordinatorId/registration-codes', authenticate, requireAnyPermission([
  { resource: 'user', action: 'manage-roles' },
  { resource: 'user', action: 'create' }
]), async (req, res, next) => {
  try {
    await coordinatorController.createRegistrationCode(req, res);
  } catch (error) {
    next(error);
  }
});

router.get('/coordinators/:coordinatorId/registration-codes', authenticate, requireAnyPermission([
  { resource: 'user', action: 'read' },
  { resource: 'user', action: 'manage-roles' }
]), async (req, res, next) => {
  try {
    await coordinatorController.listRegistrationCodes(req, res);
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
    const district = await District.findOne({ District_ID: reg.District_ID });

    return res.status(200).json({
      success: true,
      data: {
        Code: reg.Code,
        Coordinator_ID: reg.Coordinator_ID,
        District_ID: reg.District_ID,
        Province_Name: district?.Province_Name || null
      }
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message || 'Invalid or expired code' });
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

/**
 * @route   GET /api/stakeholders
 * @desc    List stakeholders (filter by district_id/email)
 * @access  Private (Admin/Coordinator)
 */
router.get('/stakeholders', authenticate, async (req, res, next) => {
  try {
    await stakeholderController.list(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/stakeholders/:stakeholderId
 * @desc    Get stakeholder by ID
 * @access  Private
 */
router.get('/stakeholders/:stakeholderId', authenticate, async (req, res, next) => {
  try {
    await stakeholderController.getById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/stakeholders/:stakeholderId
 * @desc    Update stakeholder by ID
 * @access  Private
 */
router.put('/stakeholders/:stakeholderId', authenticate, async (req, res, next) => {
  try {
    await stakeholderController.update(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/stakeholders/:stakeholderId
 * @desc    Delete stakeholder by ID
 * @access  Private
 */
router.delete('/stakeholders/:stakeholderId', authenticate, async (req, res, next) => {
  try {
    await stakeholderController.remove(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users
 * @desc    List users for admin or coordinator (unified user model)
 * @access  Private (requires user.read permission)
 */
router.get('/users', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    // Try new unified user controller first
    const { userController } = require('../controller/users_controller');
    await userController.listUsers(req, res);
  } catch (error) {
    // Fallback to legacy controller
    try {
      await require('../controller/users_controller').bloodbankStaffController.listUsers(req, res);
    } catch (legacyError) {
      next(error);
    }
  }
});

/**
 * @route   POST /api/users
 * @desc    Create a new user (unified model with RBAC)
 * @access  Private (requires user.create permission)
 */
const { validateCreateUser } = require('../validators/users_validators/user.validators');
router.post('/users', authenticate, requirePermission('user', 'create'), validateCreateUser, async (req, res, next) => {
  try {
    const { userController } = require('../controller/users_controller');
    await userController.createUser(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId
 * @desc    Update user (unified model)
 * @access  Private (requires user.update permission)
 */
const { validateUpdateUser } = require('../validators/users_validators/user.validators');
router.put('/users/:userId', authenticate, requirePermission('user', 'update'), validateUpdateUser, async (req, res, next) => {
  try {
    const { userController } = require('../controller/users_controller');
    await userController.updateUser(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/users/:userId
 * @desc    Delete user (unified model)
 * @access  Private (requires user.delete permission)
 */
router.delete('/users/:userId', authenticate, requirePermission('user', 'delete'), async (req, res, next) => {
  try {
    const { userController } = require('../controller/users_controller');
    await userController.deleteUser(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


