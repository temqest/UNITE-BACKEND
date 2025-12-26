/**
 * Legacy Requests Routes
 * 
 * NOTE: Event request routes have been moved to eventRequests.routes.js
 * This file now only contains:
 * - Blood bag request routes
 * - System settings routes
 * 
 * All event request routes are commented out below for reference.
 */

const express = require('express');
const router = express.Router();
const {
  systemSettingsController
} = require('../controller/request_controller');
const { bloodBagRequestController } = require('../controller/request_controller');

const authenticate = require('../middleware/authenticate');
const { requirePermission, requireAnyPermission } = require('../middleware/requirePermission');

const { validateCreate: validateCreateBloodBagRequest, validateUpdate: validateUpdateBloodBagRequest } = require('../validators/request_validators/bloodBagRequest.validators');

// ==================== BLOOD BAG REQUEST ROUTES ====================

/**
 * @route   POST /api/requests/blood
 * @desc    Create a blood bag request (requires request.create permission)
 * @access  Private
 */
router.post('/requests/blood', authenticate, requirePermission('request', 'create'), validateCreateBloodBagRequest, async (req, res, next) => {
  try {
    await bloodBagRequestController.createRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/blood
 * @desc    List blood bag requests with optional filters (requires request.read permission)
 * @access  Private
 */
router.get('/requests/blood', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await bloodBagRequestController.getAllRequests(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/blood/:requestId
 * @desc    Get blood bag request by ID (requires request.read permission)
 * @access  Private
 */
router.get('/requests/blood/:requestId', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await bloodBagRequestController.getRequestById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/requests/blood/:requestId
 * @desc    Update a blood bag request (requires request.update permission)
 * @access  Private
 */
router.put('/requests/blood/:requestId', authenticate, requirePermission('request', 'update'), validateUpdateBloodBagRequest, async (req, res, next) => {
  try {
    await bloodBagRequestController.updateRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/requests/blood/:requestId
 * @desc    Delete a blood bag request (requires request.delete permission)
 * @access  Private
 */
router.delete('/requests/blood/:requestId', authenticate, requirePermission('request', 'delete'), async (req, res, next) => {
  try {
    await bloodBagRequestController.deleteRequest(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== SYSTEM SETTINGS ROUTES ====================

/**
 * @route   GET /api/settings
 * @desc    Get all system settings
 * @access  Private
 */
router.get('/settings', authenticate, async (req, res, next) => {
  try {
    await systemSettingsController.getSettings(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/settings
 * @desc    Update system settings (requires system.settings permission)
 * @access  Private
 */
router.post('/settings', authenticate, requirePermission('system', 'settings'), async (req, res, next) => {
  try {
    await systemSettingsController.updateSettings(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/settings/:settingKey
 * @desc    Get a specific setting
 * @access  Private
 */
router.get('/settings/:settingKey', async (req, res, next) => {
  try {
    await systemSettingsController.getSetting(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/settings/validate-advance-booking
 * @desc    Validate advance booking rules
 * @access  Private
 */
router.post('/settings/validate-advance-booking', async (req, res, next) => {
  try {
    await systemSettingsController.validateAdvanceBooking(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/settings/validate-weekend
 * @desc    Validate weekend restriction
 * @access  Private
 */
router.post('/settings/validate-weekend', async (req, res, next) => {
  try {
    await systemSettingsController.validateWeekendRestriction(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/settings/validate-pending-requests
 * @desc    Validate pending requests limit
 * @access  Private
 */
router.post('/settings/validate-pending-requests', async (req, res, next) => {
  try {
    await systemSettingsController.validatePendingRequestsLimit(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/settings/min-booking-date
 * @desc    Get minimum booking date
 * @access  Private
 */
router.get('/settings/min-booking-date', async (req, res, next) => {
  try {
    await systemSettingsController.getMinBookingDate(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/settings/max-booking-date
 * @desc    Get maximum booking date
 * @access  Private
 */
router.get('/settings/max-booking-date', async (req, res, next) => {
  try {
    await systemSettingsController.getMaxBookingDate(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/settings/staff-assignment-required
 * @desc    Check if staff assignment is required
 * @access  Private
 */
router.get('/settings/staff-assignment-required', async (req, res, next) => {
  try {
    await systemSettingsController.isStaffAssignmentRequired(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/settings/coordinator-can-assign-staff
 * @desc    Check if coordinators can assign staff
 * @access  Private
 */
router.get('/settings/coordinator-can-assign-staff', async (req, res, next) => {
  try {
    await systemSettingsController.canCoordinatorAssignStaff(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/settings/validate-all-rules
 * @desc    Validate all rules for an event request
 * @access  Private
 */
router.post('/settings/validate-all-rules', async (req, res, next) => {
  try {
    await systemSettingsController.validateAllRules(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
