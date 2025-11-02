const calendarService = require('../../services/event_services/calendar.service');

/**
 * Calendar Controller
 * Handles all HTTP requests related to calendar operations
 */
class CalendarController {
  /**
   * Get month view - all events in a month
   * GET /api/calendar/month
   */
  async getMonthView(req, res) {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();
      const month = parseInt(req.query.month) || new Date().getMonth() + 1;
      
      const filters = {
        status: req.query.status,
        coordinator_id: req.query.coordinator_id,
        category: req.query.category
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await calendarService.getMonthView(year, month, filters);

      return res.status(200).json({
        success: result.success,
        data: result.month
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve month view'
      });
    }
  }

  /**
   * Get week view - all events in a week
   * GET /api/calendar/week
   */
  async getWeekView(req, res) {
    try {
      const weekStartDate = req.query.date 
        ? new Date(req.query.date) 
        : new Date();
      
      const filters = {
        status: req.query.status,
        coordinator_id: req.query.coordinator_id,
        category: req.query.category
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await calendarService.getWeekView(weekStartDate, filters);

      return res.status(200).json({
        success: result.success,
        data: result.week
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve week view'
      });
    }
  }

  /**
   * Get day view - all events on a specific day
   * GET /api/calendar/day
   */
  async getDayView(req, res) {
    try {
      const date = req.query.date ? new Date(req.query.date) : new Date();
      
      const filters = {
        status: req.query.status,
        coordinator_id: req.query.coordinator_id
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await calendarService.getDayView(date, filters);

      return res.status(200).json({
        success: result.success,
        data: result.day
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve day view'
      });
    }
  }

  /**
   * Get event category type and data
   * GET /api/calendar/events/:eventId/category
   */
  async getEventCategory(req, res) {
    try {
      const { eventId } = req.params;
      
      const category = await calendarService.getEventCategory(eventId);

      return res.status(200).json({
        success: true,
        data: category
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve event category'
      });
    }
  }

  /**
   * Get upcoming events summary for a date range
   * GET /api/calendar/upcoming
   */
  async getUpcomingEventsSummary(req, res) {
    try {
      const startDate = req.query.start_date 
        ? new Date(req.query.start_date) 
        : new Date();
      
      const endDate = req.query.end_date 
        ? new Date(req.query.end_date) 
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days from now
      
      const filters = {
        coordinator_id: req.query.coordinator_id
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await calendarService.getUpcomingEventsSummary(startDate, endDate, filters);

      return res.status(200).json({
        success: result.success,
        data: result.summary
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve upcoming events summary'
      });
    }
  }
}

module.exports = new CalendarController();

