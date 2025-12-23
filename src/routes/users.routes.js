const express = require('express');
const router = express.Router();
const { userController } = require('../controller/users_controller');

const registrationCodeService = require('../services/users_services/registrationCode.service');
const { Location } = require('../models/index');

const authenticate = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/requirePermission');
const { requireStaffManagement, validatePageContext } = require('../middleware/requireStaffManagement');
const validateJurisdiction = require('../middleware/validateJurisdiction');

const { validateCreateUser, validateUpdateUser } = require('../validators/users_validators/user.validators');
const { validateAssignUserCoverageArea } = require('../validators/users_validators/userCoverageAssignment.validators');
const userCoverageAssignmentController = require('../controller/users_controller/userCoverageAssignment.controller');

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
 * @route   GET /api/users/create-context
 * @desc    Get create context for user creation forms (allowedRoles, lockedFields, etc.)
 * @access  Private (requires authentication)
 */
router.get('/users/create-context', authenticate, async (req, res, next) => {
  try {
    await userController.getCreateContext(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/creation-context/municipalities
 * @desc    Get municipalities with nested barangays for coordinator creation
 * @access  Private (requires authentication)
 */
router.get('/users/creation-context/municipalities', authenticate, async (req, res, next) => {
  try {
    await userController.getMunicipalitiesWithBarangays(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/by-capability
 * @desc    List users filtered by permission capabilities
 * @access  Private (requires user.read permission)
 */
router.get('/users/by-capability', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userController.listUsersByCapability(req, res);
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
 * @route   GET /api/users/:userId/capabilities
 * @desc    Get user capabilities (diagnostic endpoint)
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/capabilities', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userController.getUserCapabilities(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/diagnostics
 * @desc    Get comprehensive diagnostic information for a user
 * @access  Private (requires user.read permission or viewing own diagnostics)
 */
router.get('/users/:userId/diagnostics', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userController.getUserDiagnostics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users
 * @desc    Create a new user (unified model with RBAC)
 * @access  Private (requires staff.create permission with appropriate staff type)
 */
router.post('/users', 
  authenticate, 
  requireStaffManagement('create', 'staffType'), 
  validatePageContext(), 
  validateJurisdiction,
  validateCreateUser, 
  async (req, res, next) => {
    try {
      // Map role code to staff type for validation
      const permissionService = require('../services/users_services/permission.service');
      let requestedStaffType = req.body.staffType;
      
      if (!requestedStaffType && req.body.roles && req.body.roles.length > 0) {
        const roleCode = req.body.roles[0];
        const role = await permissionService.getRoleByCode(roleCode);
        
        if (role) {
          // Determine staff type from role capabilities
          const hasReview = await permissionService.roleHasCapability(role._id, 'request.review');
          const hasOperational = await permissionService.roleHasCapability(role._id, 'request.create') ||
                                 await permissionService.roleHasCapability(role._id, 'event.create');
          
          if (hasReview && !hasOperational) {
            requestedStaffType = 'stakeholder';
          } else if (hasOperational) {
            requestedStaffType = 'coordinator';
          }
        }
      }
      
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
  }
);

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

// ==================== USER COVERAGE AREA ASSIGNMENT ROUTES ====================

/**
 * @route   POST /api/users/:userId/coverage-areas
 * @desc    Assign user to coverage area
 * @access  Private (requires user.manage-roles permission)
 */
router.post('/users/:userId/coverage-areas', 
  authenticate, 
  requirePermission('user', 'manage-roles'), 
  validateAssignUserCoverageArea, 
  userCoverageAssignmentController.assignUserToCoverageArea.bind(userCoverageAssignmentController)
);

/**
 * @route   GET /api/users/:userId/coverage-areas
 * @desc    Get all coverage areas assigned to a user
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/coverage-areas', 
  authenticate, 
  requirePermission('user', 'read'), 
  userCoverageAssignmentController.getUserCoverageAreas.bind(userCoverageAssignmentController)
);

/**
 * @route   GET /api/users/:userId/coverage-areas/primary
 * @desc    Get primary coverage area for a user
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/coverage-areas/primary', 
  authenticate, 
  requirePermission('user', 'read'), 
  userCoverageAssignmentController.getPrimaryCoverageArea.bind(userCoverageAssignmentController)
);

/**
 * @route   GET /api/users/:userId/coverage-areas/geographic-units
 * @desc    Get all geographic units a user can access via coverage areas
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/coverage-areas/geographic-units', 
  authenticate, 
  requirePermission('user', 'read'), 
  userCoverageAssignmentController.getUserAccessibleGeographicUnits.bind(userCoverageAssignmentController)
);

/**
 * @route   DELETE /api/users/:userId/coverage-areas/:coverageAreaId
 * @desc    Revoke user's coverage area assignment
 * @access  Private (requires user.manage-roles permission)
 */
router.delete('/users/:userId/coverage-areas/:coverageAreaId', 
  authenticate, 
  requirePermission('user', 'manage-roles'), 
  userCoverageAssignmentController.revokeUserCoverageAssignment.bind(userCoverageAssignmentController)
);

/**
 * @route   GET /api/coverage-areas/:coverageAreaId/users
 * @desc    Get all users assigned to a coverage area
 * @access  Private (requires user.read permission)
 */
router.get('/coverage-areas/:coverageAreaId/users', 
  authenticate, 
  requirePermission('user', 'read'), 
  userCoverageAssignmentController.getUsersInCoverageArea.bind(userCoverageAssignmentController)
);

module.exports = router;


