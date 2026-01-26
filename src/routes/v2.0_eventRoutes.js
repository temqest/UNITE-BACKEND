/**
 * v2.0 Event Requests Routes
 * 
 * Routes for the v2.0 event request system with /api/v2/ prefix.
 * Permission-based, role-agnostic implementation.
 */

const express = require('express');
const router = express.Router();
const { v2EventRequestController } = require('../controller/v2.0_eventControllers');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const {
  validateCreateEventRequest,
  validateUpdateEventRequest,
  validateRequestId,
  validateExecuteAction
} = require('../validators/v2.0_eventValidators');
const { cacheMiddleware, invalidateCache } = require('../middleware/cacheMiddleware');

/**
 * @route   POST /api/v2/event-requests
 * @desc    Create new event request
 * @access  Private (requires request.initiate or request.create permission)
 */
router.post(
  '/event-requests',
  authenticate,
  requirePermission('request', 'initiate'),
  validateCreateEventRequest,
  async (req, res, next) => {
    try {
      await v2EventRequestController.createEventRequest(req, res);
      // Invalidate cache
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
 * @route   GET /api/v2/event-requests
 * @desc    Get event requests (filtered by jurisdiction)
 * @access  Private (requires request.read permission)
 */
router.get(
  '/event-requests',
  authenticate,
  requirePermission('request', 'read'),
  cacheMiddleware({ ttl: 30 * 1000, etag: true }), // 30 second cache
  async (req, res, next) => {
    try {
      await v2EventRequestController.getEventRequests(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/v2/event-requests/:requestId
 * @desc    Get event request by ID
 * @access  Private (requires request.read permission or be requester/reviewer)
 */
router.get(
  '/event-requests/:requestId',
  authenticate,
  validateRequestId,
  requirePermission('request', 'read'),
  cacheMiddleware({ ttl: 5 * 60 * 1000, etag: true }), // 5 minute cache
  async (req, res, next) => {
    try {
      await v2EventRequestController.getEventRequestById(req, res);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/v2/event-requests/:requestId
 * @desc    Update event request (pending state only)
 * @access  Private (requester only)
 */
router.put(
  '/event-requests/:requestId',
  authenticate,
  validateRequestId,
  validateUpdateEventRequest,
  async (req, res, next) => {
    try {
      await v2EventRequestController.updateEventRequest(req, res);
      // Invalidate cache
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
 * @route   POST /api/v2/event-requests/:requestId/actions
 * @desc    Execute action on request (accept/reject/reschedule/confirm/cancel)
 * @access  Private (permission-based)
 */
router.post(
  '/event-requests/:requestId/actions',
  authenticate,
  validateRequestId,
  validateExecuteAction,
  async (req, res, next) => {
    try {
      await v2EventRequestController.executeAction(req, res);
      // Invalidate cache
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
 * @route   GET /api/v2/event-requests/:requestId/reviewers
 * @desc    Get available reviewers for request (broadcast visibility)
 * @access  Private (requires request.read permission)
 */
router.get(
  '/event-requests/:requestId/reviewers',
  authenticate,
  validateRequestId,
  requirePermission('request', 'read'),
  async (req, res, next) => {
    try {
      await v2EventRequestController.getReviewers(req, res);
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
