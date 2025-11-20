const express = require('express');
const router = express.Router();
const {
  calendarController,
  eventDetailsController,
  eventOverviewController,
  eventStatisticsController
} = require('../controller/events_controller');

// Public events (calendar) - intentionally public so calendar can read approved events
router.get('/public/events', async (req, res, next) => {
  try {
    await eventOverviewController.getPublicEvents(req, res);
  } catch (error) {
    next(error);
  }
});
// ==================== CALENDAR ROUTES ====================

/**
 * @route   GET /api/calendar/month
 * @desc    Get month view - all events in a month
 * @access  Private
 */
router.get('/calendar/month', async (req, res, next) => {
  try {
    await calendarController.getMonthView(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/calendar/week
 * @desc    Get week view - all events in a week
 * @access  Private
 */
router.get('/calendar/week', async (req, res, next) => {
  try {
    await calendarController.getWeekView(req, res);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/calendar/day
 * @desc    Get day view - all events on a specific day
 * @access  Private
 */
router.get('/calendar/day', async (req, res, next) => {
  try {
    await calendarController.getDayView(req, res);
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
 * @desc    Get complete event details by ID
 * @access  Private
 */
router.get('/events/:eventId', async (req, res, next) => {
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
 * @desc    Get all events with filtering, sorting, and pagination
 * @access  Private
 */
router.get('/events', async (req, res, next) => {
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
 * @desc    Get comprehensive event statistics
 * @access  Private
 */
router.get('/events/statistics', async (req, res, next) => {
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

module.exports = router;

