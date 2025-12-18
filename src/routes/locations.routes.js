/**
 * Location Routes (New Flexible Location System)
 * 
 * Routes for managing the flexible location hierarchy system.
 * Supports provinces, districts, cities, municipalities, barangays, and custom types.
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const locationService = require('../services/utility_services/location.service');

/**
 * @route   POST /api/locations
 * @desc    Create a new location
 * @access  Private (requires location.create permission)
 */
const { validateCreateLocation } = require('../validators/utility_validators/location.validators');
router.post('/locations', authenticate, requirePermission('location', 'create'), validateCreateLocation, async (req, res, next) => {
  try {
    const location = await locationService.createLocation(req.validatedData || req.body);
    return res.status(201).json({ success: true, data: location });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/tree
 * @desc    Get location tree (hierarchical structure)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/tree', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { rootId, includeInactive, maxDepth } = req.query;
    const tree = await locationService.getLocationTree(
      rootId || null,
      { includeInactive: includeInactive === 'true', maxDepth: maxDepth ? parseInt(maxDepth) : null }
    );
    return res.status(200).json({ success: true, data: tree });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/:locationId
 * @desc    Get location by ID
 * @access  Private (requires location.read permission)
 */
router.get('/locations/:locationId', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { Location } = require('../models');
    const location = await Location.findById(req.params.locationId);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    return res.status(200).json({ success: true, data: location });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/:locationId/ancestors
 * @desc    Get all ancestor locations (parents up to root)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/:locationId/ancestors', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { includeSelf, includeInactive } = req.query;
    const ancestors = await locationService.getLocationAncestors(req.params.locationId, {
      includeSelf: includeSelf === 'true',
      includeInactive: includeInactive === 'true'
    });
    return res.status(200).json({ success: true, data: ancestors });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/:locationId/descendants
 * @desc    Get all descendant locations (children recursively)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/:locationId/descendants', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { includeSelf, includeInactive, includeCitiesAsDistricts } = req.query;
    const descendants = await locationService.getLocationDescendants(req.params.locationId, {
      includeSelf: includeSelf === 'true',
      includeInactive: includeInactive === 'true',
      includeCitiesAsDistricts: includeCitiesAsDistricts !== 'false'
    });
    return res.status(200).json({ success: true, data: descendants });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/provinces
 * @desc    Get all provinces (using new Location model)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/provinces', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const provinces = await locationService.getProvinces({ includeInactive: req.query.includeInactive === 'true' });
    return res.status(200).json({ success: true, data: provinces });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/provinces/:provinceId/districts
 * @desc    Get districts for a province (including cities acting as districts)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/provinces/:provinceId/districts', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const districts = await locationService.getDistrictsByProvince(req.params.provinceId, {
      includeCities: req.query.includeCities !== 'false',
      includeCombined: req.query.includeCombined !== 'false'
    });
    return res.status(200).json({ success: true, data: districts });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/districts/:districtId/municipalities
 * @desc    Get municipalities for a district (or city acting as district)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/districts/:districtId/municipalities', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const municipalities = await locationService.getMunicipalitiesByDistrict(req.params.districtId);
    return res.status(200).json({ success: true, data: municipalities });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/type/:type
 * @desc    Get locations by type
 * @access  Private (requires location.read permission)
 */
router.get('/locations/type/:type', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { parentId } = req.query;
    const locations = await locationService.getLocationsByType(req.params.type, parentId);
    return res.status(200).json({ success: true, data: locations });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/locations/:locationId
 * @desc    Update location
 * @access  Private (requires location.update permission)
 */
const { validateUpdateLocation } = require('../validators/utility_validators/location.validators');
router.put('/locations/:locationId', authenticate, requirePermission('location', 'update'), validateUpdateLocation, async (req, res, next) => {
  try {
    const { Location } = require('../models');
    const location = await Location.findByIdAndUpdate(req.params.locationId, req.validatedData || req.body, { new: true, runValidators: true });
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    return res.status(200).json({ success: true, data: location });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/locations/:locationId
 * @desc    Delete location (soft delete by setting isActive = false)
 * @access  Private (requires location.delete permission)
 */
router.delete('/locations/:locationId', authenticate, requirePermission('location', 'delete'), async (req, res, next) => {
  try {
    const { Location } = require('../models');
    const location = await Location.findByIdAndUpdate(req.params.locationId, { isActive: false }, { new: true });
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }
    return res.status(200).json({ success: true, message: 'Location deleted', data: location });
  } catch (error) {
    next(error);
  }
});

// ==================== USER LOCATION ASSIGNMENT ROUTES ====================

/**
 * @route   POST /api/users/:userId/locations
 * @desc    Assign user to location with scope
 * @access  Private (requires user.manage-roles permission)
 */
const { validateAssignUserLocation } = require('../validators/utility_validators/location.validators');
router.post('/users/:userId/locations', authenticate, requirePermission('user', 'manage-roles'), validateAssignUserLocation, async (req, res, next) => {
  try {
    const { locationId, scope, isPrimary, expiresAt } = req.validatedData || req.body;
    const assignedBy = req.user?.id || req.user?._id;

    const assignment = await locationService.assignUserToLocation(
      req.params.userId,
      locationId,
      scope || 'exact',
      { isPrimary, assignedBy, expiresAt: expiresAt ? new Date(expiresAt) : null }
    );
    return res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/locations
 * @desc    Get all locations assigned to a user
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/locations', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    const { includeDescendants, includeInactive, onlyActiveAssignments } = req.query;
    const locations = await locationService.getUserLocations(req.params.userId, {
      includeDescendants: includeDescendants !== 'false',
      includeInactive: includeInactive === 'true',
      onlyActiveAssignments: onlyActiveAssignments !== 'false'
    });
    return res.status(200).json({ success: true, data: locations });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/locations/primary
 * @desc    Get primary location for a user
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/locations/primary', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    const primaryLocation = await locationService.getPrimaryLocation(req.params.userId);
    if (!primaryLocation) {
      return res.status(404).json({ success: false, message: 'No primary location found' });
    }
    return res.status(200).json({ success: true, data: primaryLocation });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/users/:userId/locations/:locationId
 * @desc    Revoke user's location assignment
 * @access  Private (requires user.manage-roles permission)
 */
router.delete('/users/:userId/locations/:locationId', authenticate, requirePermission('user', 'manage-roles'), async (req, res, next) => {
  try {
    await locationService.revokeUserLocation(req.params.userId, req.params.locationId);
    return res.status(200).json({ success: true, message: 'Location assignment revoked' });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/locations/:locationId/access
 * @desc    Check if user has access to a specific location
 * @access  Private (requires user.read permission)
 */
router.get('/users/:userId/locations/:locationId/access', authenticate, requirePermission('user', 'read'), async (req, res, next) => {
  try {
    const { includeDescendants, includeAncestors } = req.query;
    const hasAccess = await locationService.checkLocationAccess(req.params.userId, req.params.locationId, {
      includeDescendants: includeDescendants !== 'false',
      includeAncestors: includeAncestors !== 'false'
    });
    return res.status(200).json({ success: true, data: { hasAccess } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
