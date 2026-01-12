/**
 * Organization Routes
 * 
 * Routes for managing organizations (NGOs, blood banks, hospitals, LGUs, etc.).
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const requireAdminAuthority = require('../middleware/requireAdminAuthority');
const organizationController = require('../controller/utility_controller/organization.controller');
const { validateCreateOrganization, validateUpdateOrganization } = require('../validators/utility_validators/organization.validators');

/**
 * @route   POST /api/organizations
 * @desc    Create a new organization
 * @access  Private (requires system.settings permission or system-admin)
 */
router.post('/organizations', 
  authenticate, 
  requireAdminAuthority(),
  validateCreateOrganization, 
  organizationController.createOrganization.bind(organizationController)
);

/**
 * @route   GET /api/organizations
 * @desc    List organizations
 * @access  Private (requires user.read permission)
 */
router.get('/organizations', 
  authenticate, 
  requireAdminAuthority(),
  organizationController.listOrganizations.bind(organizationController)
);

/**
 * @route   GET /api/organizations/:id
 * @desc    Get organization by ID
 * @access  Private (requires user.read permission)
 */
router.get('/organizations/:id', 
  authenticate, 
  requireAdminAuthority(),
  organizationController.getOrganization.bind(organizationController)
);

/**
 * @route   PUT /api/organizations/:id
 * @desc    Update an organization
 * @access  Private (requires system.settings permission or system-admin)
 */
router.put('/organizations/:id', 
  authenticate, 
  requireAdminAuthority(),
  validateUpdateOrganization, 
  organizationController.updateOrganization.bind(organizationController)
);

/**
 * @route   DELETE /api/organizations/:id
 * @desc    Delete an organization (soft delete)
 * @access  Private (requires system.settings permission or system-admin)
 */
router.delete('/organizations/:id', 
  authenticate, 
  requireAdminAuthority(),
  organizationController.deleteOrganization.bind(organizationController)
);

/**
 * @route   GET /api/organizations/:id/coverage-areas
 * @desc    Get all coverage areas for an organization
 * @access  Private (requires user.read permission)
 */
router.get('/organizations/:id/coverage-areas', 
  authenticate, 
  requireAdminAuthority(),
  organizationController.getOrganizationCoverageAreas.bind(organizationController)
);

module.exports = router;

