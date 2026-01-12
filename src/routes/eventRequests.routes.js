/**
 * Event Requests Routes
 * 
 * Routes for the new event request system
 */

const express = require('express');
const router = express.Router();
const { eventRequestController } = require('../controller/eventRequests_controller');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const validateRequestAction = require('../middleware/validateRequestAction');
const validateRequestAccess = require('../middleware/validateRequestAccess');
const {
  validateCreateEventRequest,
  validateUpdateEventRequest,
  validateRequestId
} = require('../validators/eventRequests_validators/eventRequest.validators');
const { validateBatchEvents } = require('../validators/eventRequests_validators/batchEvent.validators');
const { validateExecuteAction } = require('../validators/eventRequests_validators/requestAction.validators');
const { cacheMiddleware, invalidateCache } = require('../middleware/cacheMiddleware');
const requireAdminAuthority = require('../middleware/requireAdminAuthority');

/**
 * @route   POST /api/event-requests
 * @desc    Create new event request
 * @access  Private (requires request.initiate permission)
 */
router.post(
  '/event-requests',
  authenticate,
  requirePermission('request', 'initiate'),
  validateCreateEventRequest,
  async (req, res, next) => {
    try {
      await eventRequestController.createEventRequest(req, res);
      // Invalidate cache for this user's requests
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        invalidateCache(userId.toString());
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/event-requests/batch
 * @desc    Create batch of events (admin only, bypasses request workflow)
 * @access  Private (requires admin authority ≥ 80)
 */
router.post(
  '/event-requests/batch',
  authenticate,
  requireAdminAuthority(),
  validateBatchEvents,
  async (req, res, next) => {
    try {
      await eventRequestController.createBatchEvents(req, res);
      // Invalidate cache for this user's requests
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        invalidateCache(userId.toString());
        invalidateCache(/event-requests\?/);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/event-requests
 * @desc    Get event requests (filtered by permissions)
 * @access  Private (requires request.read permission)
 */
router.get(
  '/event-requests',
  authenticate,
  requirePermission('request', 'read'),
  cacheMiddleware({ ttl: 30 * 1000, etag: true }), // 30 second cache for list
  async (req, res, next) => {
    try {
      await eventRequestController.getEventRequests(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/event-requests/:requestId
 * @desc    Get event request by ID
 * @access  Private (requires request.read permission or be requester/reviewer)
 */
router.get(
  '/event-requests/:requestId',
  authenticate,
  validateRequestId,
  validateRequestAccess,
  cacheMiddleware({ ttl: 5 * 60 * 1000, etag: true }), // 5 minute cache for detail
  async (req, res, next) => {
    try {
      await eventRequestController.getEventRequestById(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/event-requests/:requestId
 * @desc    Update event request (pending or approved)
 * @access  Private (permission check handled in service - allows assigned coordinators/reviewers)
 */
router.put(
  '/event-requests/:requestId',
  authenticate,
  validateRequestId,
  validateUpdateEventRequest,
  async (req, res, next) => {
    try {
      await eventRequestController.updateEventRequest(req, res);
      // Invalidate cache for this user's requests and the specific request
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        invalidateCache(userId.toString());
        invalidateCache(new RegExp(`event-requests/${req.params.requestId}`));
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/event-requests/:requestId/actions
 * @desc    Execute action on request (accept/reject/reschedule/confirm/cancel)
 * @access  Private (permission-based)
 */
router.post(
  '/event-requests/:requestId/actions',
  authenticate,
  validateRequestId,
  validateExecuteAction,
  validateRequestAction,
  async (req, res, next) => {
    try {
      await eventRequestController.executeAction(req, res);
      // Invalidate cache for this user's requests and the specific request
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        invalidateCache(userId.toString());
        invalidateCache(new RegExp(`event-requests/${req.params.requestId}`));
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/event-requests/:requestId/actions
 * @desc    Get available actions for user on request
 * @access  Private (requires request.read permission)
 */
router.get(
  '/event-requests/:requestId/actions',
  authenticate,
  validateRequestId,
  requirePermission('request', 'read'),
  async (req, res, next) => {
    try {
      await eventRequestController.getAvailableActions(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/event-requests/:requestId
 * @desc    Cancel request
 * @access  Private (requires request.cancel permission)
 */
router.delete(
  '/event-requests/:requestId',
  authenticate,
  validateRequestId,
  requirePermission('request', 'cancel'),
  async (req, res, next) => {
    try {
      await eventRequestController.cancelRequest(req, res);
      // Invalidate cache for this user's requests and the specific request
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        invalidateCache(userId.toString());
        invalidateCache(new RegExp(`event-requests/${req.params.requestId}`));
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/event-requests/:requestId/delete
 * @desc    Delete request (cancelled/rejected only)
 * @access  Private (requires request.delete permission)
 */
router.delete(
  '/event-requests/:requestId/delete',
  authenticate,
  validateRequestId,
  requirePermission('request', 'delete'),
  async (req, res, next) => {
    try {
      await eventRequestController.deleteRequest(req, res);
      // Invalidate cache for this user's requests and the specific request
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        invalidateCache(userId.toString());
        invalidateCache(new RegExp(`event-requests/${req.params.requestId}`));
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/event-requests/:requestId/staff
 * @desc    Assign staff to event
 * @access  Private (requires event.manage-staff permission)
 */
router.post(
  '/event-requests/:requestId/staff',
  authenticate,
  validateRequestId,
  async (req, res, next) => {
    try {
      await eventRequestController.assignStaff(req, res);
      // Invalidate cache for this user's requests and the specific request
      const userId = req.user?._id || req.user?.id;
      if (userId) {
        invalidateCache(userId.toString());
        invalidateCache(new RegExp(`event-requests/${req.params.requestId}`));
        // Also invalidate list cache
        invalidateCache(/event-requests\?/);
      }
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;

