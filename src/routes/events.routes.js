const express = require('express');
const router = express.Router();
const {
  calendarController,
  calendarNoteController,
  eventDetailsController,
  eventOverviewController,
  eventStatisticsController
} = require('../controller/events_controller');

const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const validateCoordinatorAssignment = require('../middleware/validateCoordinatorAssignment');

// Public events (calendar) - intentionally public so calendar can read approved events
router.get('/public/events', async (req, res, next) => {
  try {
    await eventOverviewController.getPublicEvents(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/public/events/:eventId
 * @desc    Get public event details by ID (approved events only, no authentication required)
 * @access  Public (returns only approved events)
 */
router.get('/public/events/:eventId', async (req, res, next) => {
  try {
    await eventDetailsController.getPublicEventDetails(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/all
 * @desc    Get all approved events for calendar consumption (with populated location names and category data)
 * @access  Public (returns only approved events)
 */
router.get('/events/all', async (req, res, next) => {
  try {
    await eventOverviewController.getAllEventsForCalendar(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/me/events
 * @desc    Get events for logged-in user based on role (SysAdmin: all, Coordinator: own+coverage+org, Stakeholder: own only)
 * @access  Private (requires authentication)
 */
router.get('/me/events', authenticate, async (req, res, next) => {
  try {
    await eventOverviewController.getUserEvents(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== CALENDAR ROUTES ====================

/**
 * @route   GET /api/calendar/month
 * @desc    Get month view - all events in a month (requires event.read permission)
 * @access  Private
 */
router.get('/calendar/month', authenticate, requirePermission('event', 'read'), async (req, res, next) => {
  try {
    await calendarController.getMonthView(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/calendar/week
 * @desc    Get week view - all events in a week (requires event.read permission)
 * @access  Private
 */
router.get('/calendar/week', authenticate, requirePermission('event', 'read'), async (req, res, next) => {
  try {
    await calendarController.getWeekView(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/calendar/day
 * @desc    Get day view - all events on a specific day (requires event.read permission)
 * @access  Private
 */
router.get('/calendar/day', authenticate, requirePermission('event', 'read'), async (req, res, next) => {
  try {
    await calendarController.getDayView(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== CALENDAR NOTES ROUTES ====================

// Authenticated-only notes; public calendar must not expose notes
router.get('/calendar/notes', authenticate, async (req, res, next) => {
  try {
    await calendarNoteController.list(req, res);
  } catch (error) {
    next(error);
  }
});

router.post('/calendar/notes', authenticate, async (req, res, next) => {
  try {
    await calendarNoteController.create(req, res);
  } catch (error) {
    next(error);
  }
});

router.patch('/calendar/notes/:id', authenticate, async (req, res, next) => {
  try {
    await calendarNoteController.update(req, res);
  } catch (error) {
    next(error);
  }
});

router.delete('/calendar/notes/:id', authenticate, async (req, res, next) => {
  try {
    await calendarNoteController.remove(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/calendar/events/:eventId/category
 * @desc    Get event category type and data
 * @access  Private
 */
router.get('/calendar/events/:eventId/category', async (req, res, next) => {
  try {
    await calendarController.getEventCategory(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/calendar/upcoming
 * @desc    Get upcoming events summary for a date range
 * @access  Private
 */
router.get('/calendar/upcoming', async (req, res, next) => {
  try {
    await calendarController.getUpcomingEventsSummary(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== EVENT DETAILS ROUTES ====================

/**
 * @route   GET /api/events/:eventId
 * @desc    Get complete event details by ID (requires event.read permission)
 * @access  Private
 */
router.get('/events/:eventId', authenticate, requirePermission('event', 'read'), async (req, res, next) => {
  try {
    await eventDetailsController.getEventDetails(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/events/batch
 * @desc    Get multiple events by IDs in a single request
 * @access  Private/Public (depends on how the caller authenticates)
 */
router.post('/events/batch', async (req, res, next) => {
  try {
    await eventDetailsController.getEventsBatch(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/:eventId/category
 * @desc    Get event category type and data
 * @access  Private
 */
router.get('/events/:eventId/category', async (req, res, next) => {
  try {
    await eventDetailsController.getEventCategory(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/coordinators/:coordinatorId
 * @desc    Get coordinator information
 * @access  Private
 */
router.get('/events/coordinators/:coordinatorId', async (req, res, next) => {
  try {
    await eventDetailsController.getCoordinatorInfo(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/:eventId/statistics
 * @desc    Get event statistics for a specific event
 * @access  Private
 */
router.get('/events/:eventId/statistics', async (req, res, next) => {
  try {
    await eventDetailsController.getEventStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/:eventId/completeness
 * @desc    Check if event has all required data
 * @access  Private
 */
router.get('/events/:eventId/completeness', async (req, res, next) => {
  try {
    await eventDetailsController.checkEventCompleteness(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== EVENT OVERVIEW ROUTES ====================

/**
 * @route   GET /api/events
 * @desc    Get all events with filtering, sorting, and pagination (requires event.read permission)
 * @access  Private
 */
router.get('/events', authenticate, requirePermission('event', 'read'), async (req, res, next) => {
  try {
    await eventOverviewController.getAllEvents(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/by-status
 * @desc    Get events grouped by status
 * @access  Private
 */
router.get('/events/by-status', async (req, res, next) => {
  try {
    await eventOverviewController.getEventsByStatus(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/upcoming
 * @desc    Get upcoming events
 * @access  Private
 */
router.get('/events/upcoming', async (req, res, next) => {
  try {
    await eventOverviewController.getUpcomingEvents(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/recent
 * @desc    Get recent events
 * @access  Private
 */
router.get('/events/recent', async (req, res, next) => {
  try {
    await eventOverviewController.getRecentEvents(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/search
 * @desc    Search events by various criteria
 * @access  Private
 */
router.get('/events/search', async (req, res, next) => {
  try {
    await eventOverviewController.searchEvents(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== EVENT STATISTICS ROUTES ====================

/**
 * @route   GET /api/events/statistics
 * @desc    Get comprehensive event statistics (requires event.read permission)
 * @access  Private
 */
router.get('/events/statistics', authenticate, requirePermission('event', 'read'), async (req, res, next) => {
  try {
    await eventStatisticsController.getEventStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/statistics/by-status
 * @desc    Get events grouped by status
 * @access  Private
 */
router.get('/events/statistics/by-status', async (req, res, next) => {
  try {
    await eventStatisticsController.getEventsByStatus(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/statistics/by-category
 * @desc    Get events grouped by category
 * @access  Private
 */
router.get('/events/statistics/by-category', async (req, res, next) => {
  try {
    await eventStatisticsController.getEventsByCategory(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/statistics/requests
 * @desc    Get request workflow statistics
 * @access  Private
 */
router.get('/events/statistics/requests', async (req, res, next) => {
  try {
    await eventStatisticsController.getRequestStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/statistics/blood-drives
 * @desc    Get blood drive specific statistics
 * @access  Private
 */
router.get('/events/statistics/blood-drives', async (req, res, next) => {
  try {
    await eventStatisticsController.getBloodDriveStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/statistics/coordinators
 * @desc    Get coordinator activity statistics
 * @access  Private
 */
router.get('/events/statistics/coordinators', async (req, res, next) => {
  try {
    await eventStatisticsController.getCoordinatorStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/statistics/timeline
 * @desc    Get timeline statistics (monthly breakdown)
 * @access  Private
 */
router.get('/events/statistics/timeline', async (req, res, next) => {
  try {
    await eventStatisticsController.getTimelineStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/events/statistics/dashboard
 * @desc    Get dashboard summary statistics
 * @access  Private
 */
router.get('/events/statistics/dashboard', async (req, res, next) => {
  try {
    await eventStatisticsController.getDashboardStatistics(req, res);
  } catch (error) {
    next(error);
  }
});

// ==================== PHASE 2: UNIFIED EVENT ENDPOINTS ====================

/**
 * @route   POST /api/events
 * @desc    UNIFIED event creation endpoint (decoupled from request workflow)
 * @desc    Direct event creation for admin/coordinator; authority-based field locking
 * @access  Private (requires event.initiate permission)
 * @body    { title, location, startDate, endDate?, category, coordinatorId?, stakeholderId? }
 * @note    Non-admins: coordinatorId forced to req.user.id, stakeholder scoped to jurisdiction
 * @middleware validateCoordinatorAssignment - Validates coordinator is valid for stakeholder
 */
router.post('/events', authenticate, requirePermission('event', 'initiate'), validateCoordinatorAssignment, async (req, res, next) => {
  try {
    // Import controller here to avoid circular dependency
    const { eventRequestController } = require('../controller/request_controller');
    await eventRequestController.createEvent(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/events/:eventId/publish
 * @desc    Publish/complete an event that has been approved
 * @desc    Sets event Status to 'Completed' and linked request to 'APPROVED'
 * @access  Private (requires event.publish OR request.approve permission)
 * @body    {} (no body required)
 */
router.post('/events/:eventId/publish', authenticate, requirePermission('event', 'publish'), async (req, res, next) => {
  try {
    // Import controller here to avoid circular dependency
    const { eventRequestController } = require('../controller/request_controller');
    await eventRequestController.publishEvent(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

