const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireAdminOrCoordinator } = require('../middleware/requireRoles');

const {
  districtController,
  notificationController
} = require('../controller/utility_controller');

const { locationController } = require('../controller/utility_controller');

const {
  validateCreateDistrict,
  validateUpdateDistrict
} = require('../validators/utility_validators/district.validators');

const {
  validateCreateNotification,
  validateUpdateNotification
} = require('../validators/utility_validators/notifications.validators');

// ==================== DISTRICT ROUTES ====================

/**
 * @route   POST /api/districts
 * @desc    Create a new district
 * @access  Private (Admin only)
 */
router.post('/districts', validateCreateDistrict, async (req, res, next) => {
  try {
    await districtController.createDistrict(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/districts/:districtId
 * @desc    Get district by ID
 * @access  Private
 */
router.get('/districts/:districtId', async (req, res, next) => {
  try {
    await districtController.getDistrictById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/districts
 * @desc    Get all districts with filtering and pagination
 * @access  Private
 */
router.get('/districts', async (req, res, next) => {
  try {
    await districtController.getAllDistricts(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/districts/by-region
 * @desc    Get districts grouped by region
 * @access  Private
 */
router.get('/districts/by-region', async (req, res, next) => {
  try {
    await districtController.getDistrictsByRegion(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/districts/:districtId
 * @desc    Update district
 * @access  Private (Admin only)
 */
router.put('/districts/:districtId', validateUpdateDistrict, async (req, res, next) => {
  try {
    await districtController.updateDistrict(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/districts/:districtId
 * @desc    Delete district
 * @access  Private (Admin only)
 */
router.delete('/districts/:districtId', async (req, res, next) => {
  try {
    await districtController.deleteDistrict(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/districts/search
 * @desc    Search districts
 * @access  Private
 */
router.get('/districts/search', async (req, res, next) => {
  try {
    await districtController.searchDistricts(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/districts/statistics
 * @desc    Get district statistics
 * @access  Private
 */
router.get('/districts/statistics', async (req, res, next) => {
  try {
    await districtController.getDistrictStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/districts/:districtId/exists
 * @desc    Check if district exists
 * @access  Private
 */
router.get('/districts/:districtId/exists', async (req, res, next) => {
  try {
    await districtController.districtExists(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== NOTIFICATION ROUTES ====================

/**
 * @route   POST /api/notifications
 * @desc    Create a new notification
 * @access  Private
 */
router.post('/notifications', validateCreateNotification, async (req, res, next) => {
  try {
    await notificationController.createNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for a user (Admin or Coordinator)
 * @access  Private
 */
router.get('/notifications', async (req, res, next) => {
  try {
    await notificationController.getNotifications(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notifications count
 * @access  Private
 */
router.get('/notifications/unread-count', async (req, res, next) => {
  try {
    await notificationController.getUnreadCount(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put('/notifications/:notificationId/read', async (req, res, next) => {
  try {
    await notificationController.markAsRead(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notifications/mark-multiple-read
 * @desc    Mark multiple notifications as read
 * @access  Private
 */
router.put('/notifications/mark-multiple-read', async (req, res, next) => {
  try {
    await notificationController.markMultipleAsRead(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notifications/mark-all-read
 * @desc    Mark all notifications as read for a user
 * @access  Private
 */
router.put('/notifications/mark-all-read', async (req, res, next) => {
  try {
    await notificationController.markAllAsRead(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications/:notificationId
 * @desc    Get notification by ID
 * @access  Private
 */
router.get('/notifications/:notificationId', async (req, res, next) => {
  try {
    await notificationController.getNotificationById(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete notification
 * @access  Private
 */
router.delete('/notifications/:notificationId', async (req, res, next) => {
  try {
    await notificationController.deleteNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications/statistics
 * @desc    Get notification statistics for a user
 * @access  Private
 */
router.get('/notifications/statistics', async (req, res, next) => {
  try {
    await notificationController.getNotificationStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications/latest
 * @desc    Get latest notifications (for dashboard/inbox preview)
 * @access  Private
 */
router.get('/notifications/latest', async (req, res, next) => {
  try {
    await notificationController.getLatestNotifications(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/new-request
 * @desc    Create new request notification (convenience method)
 * @access  Private
 */
router.post('/notifications/new-request', async (req, res, next) => {
  try {
    await notificationController.createNewRequestNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/admin-action
 * @desc    Create admin action notification (convenience method)
 * @access  Private
 */
router.post('/notifications/admin-action', async (req, res, next) => {
  try {
    await notificationController.createAdminActionNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/coordinator-action
 * @desc    Create coordinator action notification (convenience method)
 * @access  Private
 */
router.post('/notifications/coordinator-action', async (req, res, next) => {
  try {
    await notificationController.createCoordinatorActionNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/admin-cancellation
 * @desc    Create admin cancellation notification (convenience method)
 * @access  Private
 */
router.post('/notifications/admin-cancellation', async (req, res, next) => {
  try {
    await notificationController.createAdminCancellationNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/stakeholder-cancellation
 * @desc    Create stakeholder cancellation notification (convenience method)
 * @access  Private
 */
router.post('/notifications/stakeholder-cancellation', async (req, res, next) => {
  try {
    await notificationController.createStakeholderCancellationNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/request-deletion
 * @desc    Create request deletion notification (convenience method)
 * @access  Private
 */
router.post('/notifications/request-deletion', async (req, res, next) => {
  try {
    await notificationController.createRequestDeletionNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/stakeholder-deletion
 * @desc    Create stakeholder deletion notification (convenience method)
 * @access  Private
 */
router.post('/notifications/stakeholder-deletion', async (req, res, next) => {
  try {
    await notificationController.createStakeholderDeletionNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/new-signup-request
 * @desc    Create new signup request notification (convenience method)
 * @access  Private
 */
router.post('/notifications/new-signup-request', async (req, res, next) => {
  try {
    await notificationController.createNewSignupRequestNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/signup-request-approved
 * @desc    Create signup request approved notification (convenience method)
 * @access  Private
 */
router.post('/notifications/signup-request-approved', async (req, res, next) => {
  try {
    await notificationController.createSignupRequestApprovedNotification(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notifications/signup-request-rejected
 * @desc    Create signup request rejected notification (convenience method)
 * @access  Private
 */
router.post('/notifications/signup-request-rejected', async (req, res, next) => {
  try {
    await notificationController.createSignupRequestRejectedNotification(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== LOCATION & SIGNUP REQUEST ROUTES ====================

/**
 * @route   GET /api/locations/provinces
 * @desc    Get all provinces
 * @access  Public
 */
router.get('/locations/provinces', async (req, res, next) => {
  try {
    await locationController.getProvinces(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/provinces/:provinceId/districts
 * @desc    Get districts for a province
 * @access  Public
 */
router.get('/locations/provinces/:provinceId/districts', async (req, res, next) => {
  try {
    await locationController.getDistrictsByProvince(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/districts/:districtId/municipalities
 * @desc    Get municipalities for a district
 * @access  Public
 */
router.get('/locations/districts/:districtId/municipalities', async (req, res, next) => {
  try {
    await locationController.getMunicipalitiesByDistrict(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/locations/municipalities
 * @desc    Get all municipalities
 * @access  Public
 */
router.get('/locations/municipalities', async (req, res, next) => {
  try {
    await locationController.getAllMunicipalities(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/signup-requests
 * @desc    Submit a public signup request (province/district/municipality)
 * @access  Public
 */
router.post('/signup-requests', async (req, res, next) => {
  try {
    await locationController.createSignUpRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/signup-requests/:id/approve
 * @desc    Approve a signup request
 * @access  Private (Coordinator or Admin)
 */
router.put('/signup-requests/:id/approve', authenticate, requireAdminOrCoordinator, async (req, res, next) => {
  try {
    await locationController.approveRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/signup-requests/:id/reject
 * @desc    Reject a signup request
 * @access  Private (Coordinator or Admin)
 */
router.put('/signup-requests/:id/reject', authenticate, requireAdminOrCoordinator, async (req, res, next) => {
  try {
    await locationController.rejectRequest(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/signup-requests
 * @desc    Get signup requests (for coordinators: their assigned, for admins: all)
 * @access  Private (Coordinator or Admin)
 */
router.get('/signup-requests', authenticate, requireAdminOrCoordinator, async (req, res, next) => {
  try {
    await locationController.getSignUpRequests(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/signup-requests/verify-email
 * @desc    Verify email via token
 * @access  Public
 */
router.get('/signup-requests/verify-email', async (req, res, next) => {
  try {
    await locationController.verifyEmail(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
