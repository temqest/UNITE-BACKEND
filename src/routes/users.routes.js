const express = require('express');
const router = express.Router();
const { userController, notificationPreferencesController } = require('../controller/users_controller');

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
 * @route   GET /api/users/:userId/coordinator
 * @desc    Resolve coordinator(s) for a stakeholder (finds all coordinators who manage this stakeholder)
 * @access  Private (requires user.read permission, or self-read allowed for stakeholders)
 * 
 * NOTE: This route MUST be defined BEFORE /users/:userId to avoid route conflicts.
 * Express matches routes in order, so more specific routes must come first.
 */
// Add middleware to log ALL requests to this route, even before authentication
// This catches requests even if they fail authentication or other middleware
router.use('/users/:userId/coordinator', (req, res, next) => {
  console.log('[DIAG] Coordinator endpoint request intercepted:', {
    method: req.method,
    originalUrl: req.originalUrl,
    path: req.path,
    baseUrl: req.baseUrl,
    url: req.url,
    params: req.params,
    query: req.query,
    hasAuthHeader: !!req.headers.authorization,
    authHeader: req.headers.authorization ? 'Bearer ***' : 'none',
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  next();
});

router.get('/users/:userId/coordinator', authenticate, async (req, res, next) => {
  try {
    // Log immediately to confirm route is being hit
    console.log('[resolveCoordinatorForStakeholder] Route hit:', {
      method: req.method,
      path: req.path,
      params: req.params,
      userId: req.params.userId,
      hasUser: !!req.user,
      timestamp: new Date().toISOString()
    });

    // Allow stakeholders to read their own coordinator assignment without user.read permission
    const requesterId = req.user?.id || req.user?._id;
    const targetUserId = req.params.userId;
    
    // Normalize both IDs to strings for reliable comparison
    // Handle both ObjectId and string formats
    const requesterIdStr = requesterId ? (requesterId.toString ? requesterId.toString() : String(requesterId)) : null;
    const targetUserIdStr = targetUserId ? (targetUserId.toString ? targetUserId.toString() : String(targetUserId)) : null;
    
    console.log('[resolveCoordinatorForStakeholder] Route authorization check:', {
      requesterId: requesterIdStr,
      targetUserId: targetUserIdStr,
      requesterIdType: requesterId ? typeof requesterId : 'null',
      targetUserIdType: targetUserId ? typeof targetUserId : 'null',
      hasUser: !!req.user,
      timestamp: new Date().toISOString()
    });
    
    if (requesterIdStr && targetUserIdStr && requesterIdStr === targetUserIdStr) {
      // Self-read: bypass permission check
      console.log('[resolveCoordinatorForStakeholder] Self-read bypass granted:', {
        requesterId: requesterIdStr,
        targetUserId: targetUserIdStr,
        match: true,
        bypassReason: 'Self-read allowed for stakeholders'
      });
      return await userController.resolveCoordinatorForStakeholder(req, res);
    }
    
    // Log when self-read bypass doesn't match (for debugging)
    if (requesterIdStr && targetUserIdStr) {
      console.log('[resolveCoordinatorForStakeholder] Self-read check failed - requiring permission:', {
        requesterId: requesterIdStr,
        targetUserId: targetUserIdStr,
        match: false,
        reason: 'IDs do not match - not a self-read request',
        willRequirePermission: 'user.read'
      });
    } else {
      console.log('[resolveCoordinatorForStakeholder] Self-read check skipped - missing IDs:', {
        hasRequesterId: !!requesterIdStr,
        hasTargetUserId: !!targetUserIdStr,
        willRequirePermission: 'user.read'
      });
    }
    
    // Otherwise require user.read permission
    return requirePermission('user', 'read')(req, res, next);
  } catch (error) {
    console.error('[resolveCoordinatorForStakeholder] Error in route handler:', {
      error: error.message,
      stack: error.stack,
      targetUserId: req.params.userId,
      hasUser: !!req.user
    });
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/coordinator/diagnostic
 * @desc    Diagnostic endpoint to check stakeholder data and coordinator resolution
 * @access  Private (requires authentication)
 */
router.get('/users/:userId/coordinator/diagnostic', authenticate, async (req, res, next) => {
  try {
    console.log('[DIAG] Diagnostic endpoint called:', {
      userId: req.params.userId,
      requesterId: req.user?.id || req.user?._id,
      timestamp: new Date().toISOString()
    });
    await userController.diagnoseCoordinatorResolution(req, res);
  } catch (error) {
    console.error('[DIAG] Diagnostic endpoint error:', error);
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId
 * @desc    Get user by ID (unified model)
 * @access  Private (requires user.read permission, or self-read allowed)
 * 
 * NOTE: This route MUST be defined AFTER /users/:userId/coordinator to avoid route conflicts.
 * Express matches routes in order, so more specific routes must come first.
 */
router.get('/users/:userId', authenticate, async (req, res, next) => {
  try {
    // Allow users to read their own data without user.read permission
    const requesterId = req.user?.id || req.user?._id;
    const targetUserId = req.params.userId;
    
    // Normalize both IDs to strings for reliable comparison
    const requesterIdStr = requesterId ? requesterId.toString() : null;
    const targetUserIdStr = targetUserId ? targetUserId.toString() : null;
    
    if (requesterIdStr && targetUserIdStr && requesterIdStr === targetUserIdStr) {
      // Self-read: bypass permission check
      console.log('[getUserById] Self-read bypass:', {
        requesterId: requesterIdStr,
        targetUserId: targetUserIdStr,
        match: true
      });
      return await userController.getUserById(req, res);
    }
    
    // Log when self-read bypass doesn't match (for debugging)
    if (requesterIdStr && targetUserIdStr) {
      console.log('[getUserById] Self-read check failed - requiring permission:', {
        requesterId: requesterIdStr,
        targetUserId: targetUserIdStr,
        match: false
      });
    }
    
    // Otherwise require user.read permission
    return requirePermission('user', 'read')(req, res, next);
  } catch (error) {
    console.error('[getUserById] Error in route handler:', error);
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
 * @route   GET /api/users/:userId/edit-context
 * @desc    Get user edit context (complete, consistent data for editing)
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/edit-context', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userController.getUserEditContext(req, res);
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

// ==================== NOTIFICATION PREFERENCES ROUTES ====================

/**
 * @route   GET /api/users/me/notification-preferences
 * @desc    Get current user's notification preferences
 * @access  Private (authenticated users only)
 */
router.get('/users/me/notification-preferences', authenticate, async (req, res, next) => {
  try {
    await notificationPreferencesController.getMyPreferences(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/notification-preferences
 * @desc    Get user notification preferences
 * @access  Private (self-read allowed, or requires user.read permission)
 */
router.get('/users/:userId/notification-preferences', authenticate, async (req, res, next) => {
  try {
    await notificationPreferencesController.getPreferences(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/me/notification-preferences
 * @desc    Update current user's notification preferences
 * @access  Private (authenticated users only)
 */
router.put('/users/me/notification-preferences', authenticate, async (req, res, next) => {
  try {
    await notificationPreferencesController.updateMyPreferences(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId/notification-preferences
 * @desc    Update user notification preferences
 * @access  Private (self-update allowed, or requires user.update permission)
 */
router.put('/users/:userId/notification-preferences', authenticate, async (req, res, next) => {
  try {
    await notificationPreferencesController.updatePreferences(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users/me/notification-preferences/mute
 * @desc    Mute or unmute notifications for current user
 * @access  Private (authenticated users only)
 */
router.post('/users/me/notification-preferences/mute', authenticate, async (req, res, next) => {
  try {
    await notificationPreferencesController.muteNotifications(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users/:userId/notification-preferences/toggle-digest
 * @desc    Toggle digest mode for user
 * @access  Private (self-update only)
 */
router.post('/users/:userId/notification-preferences/toggle-digest', authenticate, async (req, res, next) => {
  try {
    await notificationPreferencesController.toggleDigestMode(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


