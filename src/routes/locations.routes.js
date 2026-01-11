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
    
    // Clear service-level tree cache after creating a location
    try {
      const locationServiceInstance = require('../services/utility_services/location.service');
      locationServiceInstance.clearTreeCache();
    } catch (cacheError) {
      console.warn(`[POST /locations] Failed to clear tree cache: ${cacheError.message}`);
    }
    
    return res.status(201).json({ success: true, data: location });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/tree
 * @desc    Get location tree (hierarchical structure) - OPTIMIZED with caching
 * @access  Private (requires location.read permission)
 */
router.get('/locations/tree', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { rootId, includeInactive, maxDepth, useCache } = req.query;
    
    // If no rootId, use optimized complete tree method
    if (!rootId) {
      const tree = await locationService.getCompleteTreeOptimized({
        includeInactive: includeInactive === 'true',
        useCache: useCache !== 'false' // Default to using cache
      });
      return res.status(200).json({ success: true, data: tree });
    }
    
    // For specific rootId, use the original method (but consider optimizing this too)
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
 * @desc    Get all provinces (OPTIMIZED - lightweight, no nested children)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/provinces', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const provinces = await locationService.getProvincesOptimized({ 
      includeInactive: req.query.includeInactive === 'true' 
    });
    return res.status(200).json({ success: true, data: provinces });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/provinces/:provinceId/tree
 * @desc    Get single province tree with ALL descendants (OPTIMIZED - single aggregation query)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/provinces/:provinceId/tree', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const tree = await locationService.getProvinceTreeOptimized(req.params.provinceId, {
      includeInactive: req.query.includeInactive === 'true'
    });
    return res.status(200).json({ success: true, data: tree });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/lazy-children/:parentId
 * @desc    Get immediate children of a location (OPTIMIZED - for lazy loading/progressive expansion)
 * @access  Private (requires location.read permission)
 */
router.get('/locations/lazy-children/:parentId', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { types } = req.query;
    const children = await locationService.getLocationChildrenOptimized(req.params.parentId, {
      includeInactive: req.query.includeInactive === 'true',
      types: types ? types.split(',') : null
    });
    return res.status(200).json({ success: true, data: children });
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
 * @route   GET /api/districts
 * @desc    Get all districts (including cities acting as districts)
 * @access  Private (requires location.read permission)
 */
router.get('/districts', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { limit, includeInactive } = req.query;
    const query = {
      $or: [
        { type: 'district' },
        { type: 'city', 'metadata.isCity': true }
      ]
    };
    
    if (includeInactive !== 'true') {
      query.isActive = true;
    }
    
    const { Location } = require('../models');
    let districtsQuery = Location.find(query).sort({ name: 1 });
    
    if (limit) {
      districtsQuery = districtsQuery.limit(parseInt(limit));
    }
    
    const districts = await districtsQuery;
    return res.status(200).json({ success: true, data: districts });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/municipalities
 * @desc    Get all municipalities
 * @access  Private (requires location.read permission)
 */
router.get('/locations/municipalities', authenticate, requirePermission('location', 'read'), async (req, res, next) => {
  try {
    const { limit, includeInactive } = req.query;
    const query = { type: 'municipality' };
    
    if (includeInactive !== 'true') {
      query.isActive = true;
    }
    
    const { Location } = require('../models');
    let municipalitiesQuery = Location.find(query).sort({ name: 1 });
    
    if (limit) {
      municipalitiesQuery = municipalitiesQuery.limit(parseInt(limit));
    }
    
    const municipalities = await municipalitiesQuery;
    return res.status(200).json({ success: true, data: municipalities });
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

    // Rebuild cache after successful update
    try {
      const locationCache = require('../utils/locationCache');
      const locationServiceInstance = require('../services/utility_services/location.service');
      
      if (locationCache.isCacheReady()) {
        await locationCache.rebuildCache(Location);
        console.log(`[PUT /locations] Location cache rebuilt after updating location: ${location.name}`);
      }
      
      // Clear service-level tree cache
      locationServiceInstance.clearTreeCache();
    } catch (cacheError) {
      console.warn(`[PUT /locations] Failed to rebuild cache: ${cacheError.message}`);
      // Don't fail the request due to cache rebuild failure
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

    // Rebuild cache after successful soft delete
    try {
      const locationCache = require('../utils/locationCache');
      const locationServiceInstance = require('../services/utility_services/location.service');
      
      if (locationCache.isCacheReady()) {
        await locationCache.rebuildCache(Location);
        console.log(`[DELETE /locations] Location cache rebuilt after deleting location: ${location.name}`);
      }
      
      // Clear service-level tree cache
      locationServiceInstance.clearTreeCache();
    } catch (cacheError) {
      console.warn(`[DELETE /locations] Failed to rebuild cache: ${cacheError.message}`);
      // Don't fail the request due to cache rebuild failure
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

// ==================== LOCATION CACHE MANAGEMENT ROUTES ====================

/**
 * @route   GET /api/cache/locations/status
 * @desc    Get location cache status and statistics (admin monitoring)
 * @access  Private (requires location.read permission)
 */
router.get('/cache/locations/status', authenticate, requirePermission('location', 'read'), (req, res) => {
  try {
    const locationCache = require('../utils/locationCache');
    const status = locationCache.getCacheStatus();
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get cache status', error: error.message });
  }
});

/**
 * @route   POST /api/cache/locations/rebuild
 * @desc    Rebuild location cache (admin-only endpoint for when locations are updated)
 * @access  Private (requires location.update permission and admin role)
 */
router.post('/cache/locations/rebuild', authenticate, requirePermission('location', 'update'), async (req, res, next) => {
  try {
    const locationCache = require('../utils/locationCache');
    const { Location } = require('../models');
    
    const updatedStatus = await locationCache.rebuildCache(Location, { includeInactive: false });
    return res.status(200).json({ 
      success: true, 
      message: 'Location cache rebuilt successfully',
      data: updatedStatus 
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/cache/locations/clear
 * @desc    Clear location cache (admin-only, useful for debugging)
 * @access  Private (requires location.update permission)
 */
router.post('/cache/locations/clear', authenticate, requirePermission('location', 'update'), (req, res) => {
  try {
    const locationCache = require('../utils/locationCache');
    locationCache.clearCache();
    return res.status(200).json({ success: true, message: 'Location cache cleared' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to clear cache', error: error.message });
  }
});

module.exports = router;
