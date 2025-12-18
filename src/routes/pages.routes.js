/**
 * Page Access Routes
 * 
 * Routes for checking page access permissions.
 * Frontend can use these to determine which pages to show in navigation.
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requirePageAccess } = require('../middleware/requirePageAccess');
const permissionService = require('../services/users_services/permission.service');

/**
 * @route   GET /api/pages/check/:pageRoute
 * @desc    Check if current user can access a page
 * @access  Private
 */
router.get('/pages/check/:pageRoute', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { pageRoute } = req.params;
    const locationId = req.query.locationId || null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const canAccess = await permissionService.canAccessPage(userId, pageRoute, { locationId });

    return res.status(200).json({
      success: true,
      canAccess,
      page: pageRoute
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/pages/accessible
 * @desc    Get all pages current user can access
 * @access  Private
 */
router.get('/pages/accessible', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const locationId = req.query.locationId || null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const pages = await permissionService.getAccessiblePages(userId, { locationId });

    return res.status(200).json({
      success: true,
      data: pages
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/features/available
 * @desc    Get all features current user can use
 * @access  Private
 */
router.get('/features/available', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const locationId = req.query.locationId || null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const features = await permissionService.getAvailableFeatures(userId, { locationId });

    return res.status(200).json({
      success: true,
      data: features
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/features/check/:featureCode
 * @desc    Check if current user can use a feature
 * @access  Private
 */
router.get('/features/check/:featureCode', authenticate, async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { featureCode } = req.params;
    const locationId = req.query.locationId || null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const canUse = await permissionService.canUseFeature(userId, featureCode, { locationId });

    return res.status(200).json({
      success: true,
      canUse,
      feature: featureCode
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
