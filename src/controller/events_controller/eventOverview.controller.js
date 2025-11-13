const eventOverviewService = require('../../services/event_services/eventOverview.service');

/**
 * Event Overview Controller
 * Handles all HTTP requests related to event overview and listing operations
 */
class EventOverviewController {
  /**
   * Get all events with filtering, sorting, and pagination
   * GET /api/events
   */
  async getAllEvents(req, res) {
    try {
      const filters = {
        status: req.query.status,
        coordinator_id: req.query.coordinator_id,
        location: req.query.location,
        search: req.query.search,
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'Start_Date',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const result = await eventOverviewService.getAllEvents(filters, options);

      return res.status(200).json({
        success: result.success,
        data: result.events,
        pagination: result.pagination,
        filters: result.filters
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve events'
      });
    }
  }

  /**
   * Get events grouped by status
   * GET /api/events/by-status
   */
  async getEventsByStatus(req, res) {
    try {
      const filters = {
        coordinator_id: req.query.coordinator_id,
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await eventOverviewService.getEventsByStatus(filters);

      return res.status(200).json({
        success: result.success,
        data: result.events,
        counts: result.counts
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve events by status'
      });
    }
  }

  /**
   * Get upcoming events
   * GET /api/events/upcoming
   */
  async getUpcomingEvents(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      
      const filters = {
        coordinator_id: req.query.coordinator_id
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await eventOverviewService.getUpcomingEvents(limit, filters);

      return res.status(200).json({
        success: result.success,
        data: result.events,
        total: result.total
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve upcoming events'
      });
    }
  }

  /**
   * Public events for calendar
   * GET /api/public/events
   */
  async getPublicEvents(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        category: req.query.category
      };

      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 200
      };

      const result = await eventOverviewService.getPublicEvents(filters, options);

      return res.status(200).json({
        success: true,
        data: result.events,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve public events' });
    }
  }

  /**
   * Get recent events
   * GET /api/events/recent
   */
  async getRecentEvents(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      
      const filters = {
        coordinator_id: req.query.coordinator_id,
        status: req.query.status
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await eventOverviewService.getRecentEvents(limit, filters);

      return res.status(200).json({
        success: result.success,
        data: result.events,
        total: result.total
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve recent events'
      });
    }
  }

  /**
   * Search events by various criteria
   * GET /api/events/search
   */
  async searchEvents(req, res) {
    try {
      const searchTerm = req.query.q || req.query.search;
      
      if (!searchTerm) {
        return res.status(400).json({
          success: false,
          message: 'Search term is required'
        });
      }

      const filters = {
        status: req.query.status,
        coordinator_id: req.query.coordinator_id,
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'Start_Date',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const result = await eventOverviewService.searchEvents(searchTerm, filters, options);

      return res.status(200).json({
        success: result.success,
        searchTerm: result.searchTerm,
        data: result.events,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Search failed'
      });
    }
  }
}

module.exports = new EventOverviewController();

