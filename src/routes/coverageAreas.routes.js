/**
 * Coverage Area Routes
 * 
 * Routes for managing coverage areas (logical groupings of geographic units).
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const coverageAreaController = require('../controller/utility_controller/coverageArea.controller');
const { 
  validateCreateCoverageArea, 
  validateUpdateCoverageArea,
  validateAddGeographicUnit 
} = require('../validators/utility_validators/coverageArea.validators');

/**
 * @route   POST /api/coverage-areas
 * @desc    Create a new coverage area
 * @access  Private (requires system.settings permission or system-admin)
 */
router.post('/coverage-areas', 
  authenticate, 
  requirePermission('system', 'settings'), 
  validateCreateCoverageArea, 
  coverageAreaController.createCoverageArea.bind(coverageAreaController)
);

/**
 * @route   GET /api/coverage-areas
 * @desc    List coverage areas
 * @access  Private (requires user.read permission)
 */
router.get('/coverage-areas', 
  authenticate, 
  requirePermission('user', 'read'), 
  coverageAreaController.listCoverageAreas.bind(coverageAreaController)
);

/**
 * @route   GET /api/coverage-areas/:id
 * @desc    Get coverage area by ID
 * @access  Private (requires user.read permission)
 */
router.get('/coverage-areas/:id', 
  authenticate, 
  requirePermission('user', 'read'), 
  coverageAreaController.getCoverageArea.bind(coverageAreaController)
);

/**
 * @route   PUT /api/coverage-areas/:id
 * @desc    Update a coverage area
 * @access  Private (requires system.settings permission or system-admin)
 */
router.put('/coverage-areas/:id', 
  authenticate, 
  requirePermission('system', 'settings'), 
  validateUpdateCoverageArea, 
  coverageAreaController.updateCoverageArea.bind(coverageAreaController)
);

/**
 * @route   DELETE /api/coverage-areas/:id
 * @desc    Delete a coverage area (soft delete)
 * @access  Private (requires system.settings permission or system-admin)
 */
router.delete('/coverage-areas/:id', 
  authenticate, 
  requirePermission('system', 'settings'), 
  coverageAreaController.deleteCoverageArea.bind(coverageAreaController)
);

/**
 * @route   GET /api/coverage-areas/:id/geographic-units
 * @desc    Get all geographic units in a coverage area
 * @access  Private (requires user.read permission)
 */
router.get('/coverage-areas/:id/geographic-units', 
  authenticate, 
  requirePermission('user', 'read'), 
  coverageAreaController.getCoverageAreaGeographicUnits.bind(coverageAreaController)
);

/**
 * @route   GET /api/geographic-units/:id/coverage-areas
 * @desc    Get all coverage areas containing a specific geographic unit
 * @access  Private (requires user.read permission)
 */
router.get('/geographic-units/:id/coverage-areas', 
  authenticate, 
  requirePermission('user', 'read'), 
  coverageAreaController.getCoverageAreasByGeographicUnit.bind(coverageAreaController)
);

/**
 * @route   POST /api/coverage-areas/:id/geographic-units
 * @desc    Add a geographic unit to a coverage area
 * @access  Private (requires system.settings permission or system-admin)
 */
router.post('/coverage-areas/:id/geographic-units', 
  authenticate, 
  requirePermission('system', 'settings'), 
  validateAddGeographicUnit, 
  coverageAreaController.addGeographicUnit.bind(coverageAreaController)
);

/**
 * @route   DELETE /api/coverage-areas/:id/geographic-units/:geographicUnitId
 * @desc    Remove a geographic unit from a coverage area
 * @access  Private (requires system.settings permission or system-admin)
 */
router.delete('/coverage-areas/:id/geographic-units/:geographicUnitId', 
  authenticate, 
  requirePermission('system', 'settings'), 
  coverageAreaController.removeGeographicUnit.bind(coverageAreaController)
);

module.exports = router;

