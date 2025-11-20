const eventDetailsService = require('../../services/event_services/eventDetails.service');

/**
 * Event Details Controller
 * Handles all HTTP requests related to event details operations
 */
class EventDetailsController {
  /**
   * Get complete event details by ID
   * GET /api/events/:eventId
   */
  async getEventDetails(req, res) {
    try {
      const { eventId } = req.params;
      
      const result = await eventDetailsService.getEventDetails(eventId);

      return res.status(200).json({
        success: result.success,
        data: result.event
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Event not found'
      });
    }
  }

  /**
   * Get event category type and data
   * GET /api/events/:eventId/category
   */
  async getEventCategory(req, res) {
    try {
      const { eventId } = req.params;
      
      const category = await eventDetailsService.getEventCategory(eventId);

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
   * Get coordinator information
   * GET /api/events/coordinators/:coordinatorId
   */
  async getCoordinatorInfo(req, res) {
    try {
      const { coordinatorId } = req.params;
      
      const coordinator = await eventDetailsService.getCoordinatorInfo(coordinatorId);

      return res.status(200).json({
        success: true,
        data: coordinator
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve coordinator information'
      });
    }
  }

  /**
   * Get event statistics for a specific event
   * GET /api/events/:eventId/statistics
   */
  async getEventStatistics(req, res) {
    try {
      const { eventId } = req.params;
      
      const result = await eventDetailsService.getEventStatistics(eventId);

      return res.status(200).json({
        success: result.success,
        data: result.statistics
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Event not found'
      });
    }
  }

  /**
   * Check if event has all required data
   * GET /api/events/:eventId/completeness
   */
  async checkEventCompleteness(req, res) {
    try {
      const { eventId } = req.params;
      
      const result = await eventDetailsService.checkEventCompleteness(eventId);

      return res.status(200).json({
        success: result.success,
        data: result.completeness
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Event not found'
      });
    }
  }

  /**
   * Batch fetch events by Event_IDs
   * POST /api/events/batch
   */
  async getEventsBatch(req, res) {
    try {
      const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];

      const result = await eventDetailsService.getEventsBatch(ids);

      return res.status(200).json({ success: true, data: result.events });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve events batch' });
    }
  }
}

module.exports = new EventDetailsController();

