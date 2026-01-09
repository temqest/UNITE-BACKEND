/**
 * RBAC Routes
 * 
 * Routes for managing roles, permissions, and user role assignments.
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const { validateCreatePermission, validateUpdatePermission } = require('../validators/rbac_validators/permission.validators');
const permissionService = require('../services/users_services/permission.service');
const { Role, Permission, UserRole, User } = require('../models');
const roleController = require('../controller/rbac_controller/role.controller');
const permissionController = require('../controller/rbac_controller/permission.controller');
const userRoleController = require('../controller/rbac_controller/userRole.controller');

/**
 * @route   GET /api/roles
 * @desc    Get all roles
 * @access  Private (requires role.read permission)
 */
router.get('/roles', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await roleController.getAllRoles(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/roles/:roleId
 * @desc    Get role by ID
 * @access  Private (requires role.read permission)
 */
router.get('/roles/:roleId', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await roleController.getRoleById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/roles
 * @desc    Create a new role
 * @access  Private (requires role.create permission)
 */
const { validateCreateRole } = require('../validators/rbac_validators/role.validators');
router.post('/roles', authenticate, requirePermission('role', 'create'), validateCreateRole, async (req, res, next) => {
  try {
    const roleController = require('../controller/rbac_controller/role.controller');
    await roleController.createRole(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/roles/:roleId
 * @desc    Update role
 * @access  Private (requires role.update permission)
 */
const { validateUpdateRole } = require('../validators/rbac_validators/role.validators');
router.put('/roles/:roleId', authenticate, requirePermission('role', 'update'), validateUpdateRole, async (req, res, next) => {
  try {
    await roleController.updateRole(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/roles/:roleId/users-count
 * @desc    Get count of users assigned to a role
 * @access  Private (requires role.read permission)
 */
router.get('/roles/:roleId/users-count', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await roleController.getRoleUsersCount(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/roles/:roleId
 * @desc    Delete role
 * @access  Private (requires role.delete permission)
 */
router.delete('/roles/:roleId', authenticate, requirePermission('role', 'delete'), async (req, res, next) => {
  try {
    await roleController.deleteRole(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/permissions
 * @desc    Get all permissions
 * @access  Private (requires role.read permission)
 */
router.get('/permissions', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await permissionController.getAllPermissions(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/roles
 * @desc    Get all roles assigned to a user
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/roles', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userRoleController.getUserRoles(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users/:userId/roles
 * @desc    Assign role to user
 * @access  Private (requires user.manage-roles permission)
 */
const { validateAssignRole } = require('../validators/rbac_validators/role.validators');
router.post('/users/:userId/roles', authenticate, requirePermission('user', 'manage-roles'), validateAssignRole, async (req, res, next) => {
  try {
    await userRoleController.assignRole(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/users/:userId/roles/:roleId
 * @desc    Revoke role from user
 * @access  Private (requires user.manage-roles permission)
 */
router.delete('/users/:userId/roles/:roleId', authenticate, requirePermission('user', 'manage-roles'), async (req, res, next) => {
  try {
    await userRoleController.revokeRole(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/permissions
 * @desc    Get all permissions for a user
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/permissions', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userRoleController.getUserPermissions(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/permissions/check
 * @desc    Check if user has a specific permission
 * @access  Private
 */
const { validateCheckPermission } = require('../validators/rbac_validators/permission.validators');
router.post('/permissions/check', authenticate, validateCheckPermission, async (req, res, next) => {
  try {
    await permissionController.checkPermission(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/permissions/:id
 * @desc    Get permission by ID
 * @access  Private (requires role.read permission)
 */
router.get('/permissions/:id', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await permissionController.getPermissionById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/permissions
 * @desc    Create a new permission
 * @access  Private (requires role.create permission)
 */
router.post('/permissions', authenticate, requirePermission('role', 'create'), validateCreatePermission, async (req, res, next) => {
  try {
    await permissionController.createPermission(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/permissions/:id
 * @desc    Update permission
 * @access  Private (requires role.update permission)
 */
router.put('/permissions/:id', authenticate, requirePermission('role', 'update'), validateUpdatePermission, async (req, res, next) => {
  try {
    await permissionController.updatePermission(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/permissions/:id
 * @desc    Delete permission
 * @access  Private (requires role.delete permission)
 */
router.delete('/permissions/:id', authenticate, requirePermission('role', 'delete'), async (req, res, next) => {
  try {
    await permissionController.deletePermission(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/permissions/user/:userId/pages
 * @desc    Get user's accessible pages
 * @access  Private (requires user.read permission)
 */
router.get('/permissions/user/:userId/pages', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await permissionController.getUserPages(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/permissions/user/:userId/features
 * @desc    Get user's available features
 * @access  Private (requires user.read permission)
 */
router.get('/permissions/user/:userId/features', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await permissionController.getUserFeatures(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/permissions/user/:userId/staff-types/:action
 * @desc    Get user's allowed staff types for an action
 * @access  Private (requires user.read permission)
 */
router.get('/permissions/user/:userId/staff-types/:action', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await permissionController.getAllowedStaffTypes(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/rbac/authority/user/:userId
 * @desc    Get user's authority level
 * @access  Private (requires user.read permission, or self-read allowed)
 */
router.get('/authority/user/:userId', authenticate, async (req, res, next) => {
  try {
    // Allow users to read their own authority without user.read permission
    const requesterId = req.user?.id || req.user?._id;
    const targetUserId = req.params.userId;
    
    // Normalize both IDs to strings for reliable comparison
    const requesterIdStr = requesterId ? requesterId.toString() : null;
    const targetUserIdStr = targetUserId ? targetUserId.toString() : null;
    
    if (requesterIdStr && targetUserIdStr && requesterIdStr === targetUserIdStr) {
      // Self-read: bypass permission check
      console.log('[getUserAuthority] Self-read bypass:', {
        requesterId: requesterIdStr,
        targetUserId: targetUserIdStr,
        match: true
      });
      return await permissionController.getUserAuthority(req, res);
    }
    
    // Log when self-read bypass doesn't match (for debugging)
    if (requesterIdStr && targetUserIdStr) {
      console.log('[getUserAuthority] Self-read check failed - requiring permission:', {
        requesterId: requesterIdStr,
        targetUserId: targetUserIdStr,
        match: false,
        requesterType: typeof requesterId,
        targetType: typeof targetUserId
      });
    }
    
    // Otherwise require user.read permission
    return requirePermission('user', 'read')(req, res, next);
  } catch (error) {
    console.error('[getUserAuthority] Error in route handler:', error);
    next(error);
  }
});

/**
 * @route   GET /api/rbac/authority/role/:roleId
 * @desc    Get role's authority level
 * @access  Private (requires role.read permission)
 */
router.get('/authority/role/:roleId', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await permissionController.getRoleAuthority(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/rbac/authority/assignable-roles
 * @desc    Get assignable roles for current user
 * @access  Private
 */
router.get('/authority/assignable-roles', authenticate, async (req, res, next) => {
  try {
    await permissionController.getAssignableRoles(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
