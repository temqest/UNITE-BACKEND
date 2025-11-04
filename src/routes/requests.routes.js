const express = require('express');
const router = express.Router();
const {
  eventRequestController,
  systemSettingsController
} = require('../controller/request_controller');

const {
  validateCreateEventRequest,
  validateUpdateEventRequest
} = require('../validators/request_validators/eventRequest.validators');

// ==================== EVENT REQUEST ROUTES ====================

/**
 * @route   POST /api/requests
 * @desc    Coordinator submits event request
 * @access  Private (Coordinator)
 */
router.post('/requests', async (req, res, next) => {
  try {
    await eventRequestController.createEventRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/events/direct
 * @desc    Create and publish event immediately (Admin or Coordinator)
 * @access  Private
 */
router.post('/events/direct', async (req, res, next) => {
  try {
    await eventRequestController.createImmediateEvent(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/pending
 * @desc    Get all pending requests for admin
 * @access  Private (Admin only)
 */
router.get('/requests/pending', async (req, res, next) => {
  try {
    await eventRequestController.getPendingRequests(req, res);
  } catch (error) {
    next(error);
  }
});



/**
 * @route   GET /api/requests/coordinator/:coordinatorId
 * @desc    Get all requests for coordinator
 * @access  Private (Coordinator)
 */
router.get('/requests/coordinator/:coordinatorId', async (req, res, next) => {
  try {
    await eventRequestController.getCoordinatorRequests(req, res);
  } catch (error) {
    next(error);
  }
});



/**
 * @route   GET /api/requests/check-overlap
 * @desc    Check if coordinator has overlapping requests
 * @access  Private
 */
router.get('/requests/check-overlap', async (req, res, next) => {
  try {
    await eventRequestController.checkCoordinatorOverlappingRequests(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/check-double-booking
 * @desc    Check if date has double booking (location/venue)
 * @access  Private
 */
router.get('/requests/check-double-booking', async (req, res, next) => {
  try {
    await eventRequestController.checkDoubleBooking(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/validate
 * @desc    Validate all scheduling rules
 * @access  Private
 */
router.post('/requests/validate', async (req, res, next) => {
  try {
    await eventRequestController.validateSchedulingRules(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/blood-bags/:date
 * @desc    Get total blood bags for a specific date
 * @access  Private
 */
router.get('/requests/blood-bags/:date', async (req, res, next) => {
  try {
    await eventRequestController.getTotalBloodBagsForDate(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * Parameterized request routes - placed after all specific routes to avoid
 * Express treating static paths like 'pending' or 'coordinator' as a requestId.
 */
/**
 * @route   GET /api/requests/:requestId
 * @desc    Get event request by ID with full details
 * @access  Private
 */
router.get('/requests/:requestId', async (req, res, next) => {
  try {
    await eventRequestController.getEventRequestById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/requests/:requestId
 * @desc    Update pending event request
 * @access  Private (Coordinator)
 */
router.put('/requests/:requestId', validateUpdateEventRequest, async (req, res, next) => {
  try {
    await eventRequestController.updateEventRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/admin-action
 * @desc    Admin accepts/rejects/reschedules the request
 * @access  Private (Admin only)
 */
router.post('/requests/:requestId/admin-action', async (req, res, next) => {
  try {
    await eventRequestController.adminAcceptRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/staff
 * @desc    Assign staff to event (Admin only)
 * @access  Private (Admin only)
 */
router.post('/requests/:requestId/staff', async (req, res, next) => {
  try {
    await eventRequestController.assignStaffToEvent(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/coordinator-confirm
 * @desc    Coordinator confirms admin's decision
 * @access  Private (Coordinator)
 */
router.post('/requests/:requestId/coordinator-confirm', async (req, res, next) => {
  try {
    await eventRequestController.coordinatorConfirmRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/requests/:requestId
 * @desc    Cancel/Delete pending request
 * @access  Private (Coordinator)
 */
router.delete('/requests/:requestId', async (req, res, next) => {
  try {
    await eventRequestController.cancelEventRequest(req, res);
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
router.get('/settings', async (req, res, next) => {
  try {
    await systemSettingsController.getSettings(req, res);
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

