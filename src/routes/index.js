const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const permissionController = require('../controller/rbac_controller/permission.controller');
const roleController = require('../controller/rbac_controller/role.controller');
const userRoleController = require('../controller/rbac_controller/userRole.controller');
const { validateCheckPermission } = require('../validators/rbac_validators/permission.validators');

// Import all route modules
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const eventsRoutes = require('./events.routes');
const requestsRoutes = require('./requests.routes'); // Legacy routes (kept for backward compatibility)
const eventRequestsRoutes = require('./eventRequests.routes'); // New event request system
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

