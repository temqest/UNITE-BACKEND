const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const permissionController = require('../controller/rbac_controller/permission.controller');
const roleController = require('../controller/rbac_controller/role.controller');
const userRoleController = require('../controller/rbac_controller/userRole.controller');
const { validateCheckPermission } = require('../validators/rbac_validators/permission.validators');
const { validateCreateRole, validateUpdateRole } = require('../validators/rbac_validators/role.validators');

// Import all route modules
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const eventsRoutes = require('./events.routes');
const requestsRoutes = require('./requests.routes'); // Legacy routes (kept for backward compatibility)
const eventRequestsRoutes = require('./eventRequests.routes'); // New event request system
const v2EventRequestsRoutes = require('./v2.0_eventRoutes'); // v2.0 event request system
const utilityRoutes = require('./utility.routes');
const inventoryRoutes = require('./inventory.routes');
const chatRoutes = require('./chat.routes');
const filesRoutes = require('./files.routes');
const locationsRoutes = require('./locations.routes'); // New flexible location system routes
const organizationsRoutes = require('./organizations.routes'); // Organization management routes
const coverageAreasRoutes = require('./coverageAreas.routes'); // Coverage area management routes
const rbacRoutes = require('./rbac.routes'); // RBAC management routes
const pagesRoutes = require('./pages.routes'); // Page and feature access routes
const stakeholderRoutes = require('./stakeholder.routes'); // Stakeholder management routes

// Mount routes
// Auth routes are mounted under /api/auth (canonical) and also under /api
// to preserve compatibility with frontend calls that expect /api/login.
router.use('/api/auth', authRoutes);
router.use('/api', authRoutes);
router.use('/api', usersRoutes);
router.use('/api', eventsRoutes);
router.use('/api', requestsRoutes); // Legacy routes (kept for backward compatibility)
router.use('/api', eventRequestsRoutes); // New event request system
router.use('/api/v2', v2EventRequestsRoutes); // v2.0 event request system (permission-based)
router.use('/api', utilityRoutes);
router.use('/api', inventoryRoutes);
router.use('/api', locationsRoutes); // New flexible location routes
router.use('/api', organizationsRoutes); // Organization management routes
router.use('/api', coverageAreasRoutes); // Coverage area management routes
router.use('/api/rbac', rbacRoutes); // RBAC management routes
router.use('/api', pagesRoutes); // Page and feature access routes
router.use('/api', stakeholderRoutes); // Stakeholder management routes
router.use('/api/chat', chatRoutes);
router.use('/api/files', filesRoutes);

// Add direct routes under /api for frontend compatibility
// These routes are also available under /api/rbac for consistency
/**
 * @route   POST /api/permissions/check
 * @desc    Check if user has a specific permission
 * @access  Private
 */
router.post('/api/permissions/check', authenticate, validateCheckPermission, async (req, res, next) => {
  try {
    await permissionController.checkPermission(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/permissions
 * @desc    Get all permissions
 * @access  Private (requires role.read permission)
 */
router.get('/api/permissions', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await permissionController.getAllPermissions(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/roles
 * @desc    Get all roles
 * @access  Private (requires role.read permission)
 */
router.get('/api/roles', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await roleController.getAllRoles(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/roles
 * @desc    Create a new role
 * @access  Private (requires role.create permission)
 */
router.post('/api/roles', authenticate, requirePermission('role', 'create'), validateCreateRole, async (req, res, next) => {
  try {
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
router.put('/api/roles/:roleId', authenticate, requirePermission('role', 'update'), validateUpdateRole, async (req, res, next) => {
  try {
    await roleController.updateRole(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/roles/:roleId
 * @desc    Delete role (prevents deletion if users are assigned)
 * @access  Private (requires role.delete permission)
 */
router.delete('/api/roles/:roleId', authenticate, requirePermission('role', 'delete'), async (req, res, next) => {
  try {
    await roleController.deleteRole(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/roles/:roleId/users-count
 * @desc    Get count of users assigned to a role
 * @access  Private (requires role.read permission)
 */
router.get('/api/roles/:roleId/users-count', authenticate, requirePermission('role', 'read'), async (req, res, next) => {
  try {
    await roleController.getRoleUsersCount(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/roles
 * @desc    Get all roles assigned to a user
 * @access  Private (requires user.read permission)
 */
router.get('/api/users/:userId/roles', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    await userRoleController.getUserRoles(req, res);
  } catch (error) {
    next(error);
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;

