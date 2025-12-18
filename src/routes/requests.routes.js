const express = require('express');
const router = express.Router();
const {
  eventRequestController,
  systemSettingsController
} = require('../controller/request_controller');
const { bloodBagRequestController } = require('../controller/request_controller');

const authenticate = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/requireRoles'); // Legacy - kept for backward compatibility
const { requirePermission, requireAnyPermission } = require('../middleware/requirePermission');

const {
  validateCreateEventRequest,
  validateUpdateEventRequest
} = require('../validators/request_validators/eventRequest.validators');
const { validateCreate: validateCreateBloodBagRequest, validateUpdate: validateUpdateBloodBagRequest } = require('../validators/request_validators/bloodBagRequest.validators');

// ==================== EVENT REQUEST ROUTES ====================

/**
 * @route   POST /api/requests
 * @desc    Create event request (role-agnostic)
 * @access  Private (requires request.create permission)
 */
router.post('/requests', authenticate, requirePermission('request', 'create'), async (req, res, next) => {
  try {
    await eventRequestController.createEventRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/events/direct
 * @desc    Create and publish event immediately (requires event.create and event.approve permissions)
 * @access  Private
 */
router.post('/events/direct', authenticate, requireAnyPermission([
  { resource: 'event', action: 'create' },
  { resource: 'event', action: 'approve' }
]), async (req, res, next) => {
  try {
    await eventRequestController.createImmediateEvent(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/pending
 * @desc    Get all pending requests (requires request.read permission)
 * @access  Private
 */
router.get('/requests/pending', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await eventRequestController.getPendingRequests(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/me
 * @desc    Get requests for the authenticated user (role-aware)
 * @access  Private
 */
router.get('/requests/me', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await eventRequestController.getMyRequests(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/all
 * @desc    Get all requests (requires request.read permission)
 * @access  Private
 */
router.get('/requests/all', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await eventRequestController.getAllRequests(req, res);
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
 * @route   GET /api/requests/stakeholder/:stakeholderId
 * @desc    Get all requests created by a stakeholder
 * @access  Private (Stakeholder)
 */
router.get('/requests/stakeholder/:stakeholderId', async (req, res, next) => {
  try {
    await eventRequestController.getStakeholderRequests(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/coordinator-action
 * @desc    Reviewer accepts/rejects the request (permission-based)
 * @access  Private (requires request.review permission)
 */
router.post('/requests/:requestId/coordinator-action', authenticate, requireAnyPermission([
  { resource: 'request', action: 'approve' },
  { resource: 'request', action: 'reject' }
]), async (req, res, next) => {
  try {
    await eventRequestController.coordinatorAcceptRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/coordinator-confirm
 * @desc    Requester confirms reviewer's decision (permission-based)
 * @access  Private (requires request.confirm permission)
 */
router.post('/requests/:requestId/coordinator-confirm', authenticate, requirePermission('request', 'confirm'), async (req, res, next) => {
  try {
    await eventRequestController.coordinatorConfirmRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/stakeholder-action
 * @desc    Reviewer accepts/rejects the request (permission-based)
 * @access  Private (requires request.review permission)
 */
router.post('/requests/:requestId/stakeholder-action', authenticate, requireAnyPermission([
  { resource: 'request', action: 'approve' },
  { resource: 'request', action: 'reject' }
]), async (req, res, next) => {
  try {
    await eventRequestController.stakeholderAcceptRequest(req, res);
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

/**
 * Parameterized request routes - placed after all specific routes to avoid
 * Express treating static paths like 'pending' or 'coordinator' as a requestId.
 */
/**
 * @route   GET /api/requests/:requestId
 * @desc    Get event request by ID with full details
 * @access  Private (requires request.read permission)
 */
router.get('/requests/:requestId', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await eventRequestController.getEventRequestById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/requests/:requestId
 * @desc    Update pending event request
 * @access  Private (requires request.update permission)
 */
router.put('/requests/:requestId', authenticate, requirePermission('request', 'update'), validateUpdateEventRequest, async (req, res, next) => {
  try {
    await eventRequestController.updateEventRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/admin-action
 * @desc    Reviewer accepts/rejects/reschedules the request (permission-based)
 * @access  Private (requires request.review permission)
 */
router.post('/requests/:requestId/admin-action', authenticate, requireAnyPermission([
  { resource: 'request', action: 'approve' },
  { resource: 'request', action: 'reject' },
  { resource: 'request', action: 'reschedule' }
]), async (req, res, next) => {
  try {
    await eventRequestController.adminAcceptRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/staff
 * @desc    Assign staff to event (requires event.update permission)
 * @access  Private
 */
router.post('/requests/:requestId/staff', authenticate, requirePermission('event', 'update'), async (req, res, next) => {
  try {
    await eventRequestController.assignStaffToEvent(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/stakeholder-confirm
 * @desc    Requester confirms reviewer decision (permission-based)
 * @access  Private (requires request.confirm permission)
 */
router.post('/requests/:requestId/stakeholder-confirm', authenticate, requirePermission('request', 'confirm'), async (req, res, next) => {
  try {
    await eventRequestController.stakeholderConfirmRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/requests/:requestId
 * @desc    Cancel pending request (requires request.cancel permission)
 * @access  Private
 */
router.delete('/requests/:requestId', authenticate, requirePermission('request', 'cancel'), async (req, res, next) => {
  try {
    await eventRequestController.cancelEventRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/requests/:requestId/delete
 * @desc    Delete a cancelled or rejected request (requires request.delete permission)
 * @access  Private
 */
router.delete('/requests/:requestId/delete', authenticate, requirePermission('request', 'delete'), async (req, res, next) => {
  try {
    await eventRequestController.deleteEventRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/requests/:requestId/actions
 * @desc    Execute unified request action (accept, reject, reschedule, cancel, delete, confirm, decline)
 * @access  Private (permission-based)
 * @body    { action: string, data: object }
 */
const { validateExecuteAction } = require('../validators/request_validators/requestAction.validators');
router.post('/requests/:requestId/actions', authenticate, validateExecuteAction, async (req, res, next) => {
  try {
    await eventRequestController.executeRequestAction(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/requests/:requestId/actions
 * @desc    Get available actions for a user on a request
 * @access  Private
 */
router.get('/requests/:requestId/actions', authenticate, requirePermission('request', 'read'), async (req, res, next) => {
  try {
    await eventRequestController.getAvailableActions(req, res);
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

