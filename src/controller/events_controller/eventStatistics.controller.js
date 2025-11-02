const eventStatisticsService = require('../../services/event_services/eventStatistics.service');

/**
 * Event Statistics Controller
 * Handles all HTTP requests related to event statistics operations
 */
class EventStatisticsController {
  /**
   * Get comprehensive event statistics
   * GET /api/events/statistics
   */
  async getEventStatistics(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await eventStatisticsService.getEventStatistics(filters);

      return res.status(200).json({
        success: result.success,
        data: result.statistics
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve statistics'
      });
    }
  }

  /**
   * Get events grouped by status
   * GET /api/events/statistics/by-status
   */
  async getEventsByStatus(req, res) {
    try {
      const dateFilter = {};
      
      if (req.query.date_from || req.query.date_to) {
        dateFilter.Start_Date = {};
        if (req.query.date_from) {
          dateFilter.Start_Date.$gte = new Date(req.query.date_from);
        }
        if (req.query.date_to) {
          dateFilter.Start_Date.$lte = new Date(req.query.date_to);
        }
      }

      const result = await eventStatisticsService.getEventsByStatus(dateFilter);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve status breakdown'
      });
    }
  }

  /**
   * Get events grouped by category
   * GET /api/events/statistics/by-category
   */
  async getEventsByCategory(req, res) {
    try {
      const dateFilter = {};
      
      if (req.query.date_from || req.query.date_to) {
        dateFilter.Start_Date = {};
        if (req.query.date_from) {
          dateFilter.Start_Date.$gte = new Date(req.query.date_from);
        }
        if (req.query.date_to) {
          dateFilter.Start_Date.$lte = new Date(req.query.date_to);
        }
      }

      const result = await eventStatisticsService.getEventsByCategory(dateFilter);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve category breakdown'
      });
    }
  }

  /**
   * Get request workflow statistics
   * GET /api/events/statistics/requests
   */
  async getRequestStatistics(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await eventStatisticsService.getRequestStatistics(filters);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve request statistics'
      });
    }
  }

  /**
   * Get blood drive specific statistics
   * GET /api/events/statistics/blood-drives
   */
  async getBloodDriveStatistics(req, res) {
    try {
      const dateFilter = {};
      
      if (req.query.date_from || req.query.date_to) {
        dateFilter.Start_Date = {};
        if (req.query.date_from) {
          dateFilter.Start_Date.$gte = new Date(req.query.date_from);
        }
        if (req.query.date_to) {
          dateFilter.Start_Date.$lte = new Date(req.query.date_to);
        }
      }

      const result = await eventStatisticsService.getBloodDriveStatistics(dateFilter);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve blood drive statistics'
      });
    }
  }

  /**
   * Get coordinator activity statistics
   * GET /api/events/statistics/coordinators
   */
  async getCoordinatorStatistics(req, res) {
    try {
      const dateFilter = {};
      
      if (req.query.date_from || req.query.date_to) {
        dateFilter.Start_Date = {};
        if (req.query.date_from) {
          dateFilter.Start_Date.$gte = new Date(req.query.date_from);
        }
        if (req.query.date_to) {
          dateFilter.Start_Date.$lte = new Date(req.query.date_to);
        }
      }

      const result = await eventStatisticsService.getCoordinatorStatistics(dateFilter);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve coordinator statistics'
      });
    }
  }

  /**
   * Get timeline statistics (monthly breakdown)
   * GET /api/events/statistics/timeline
   */
  async getTimelineStatistics(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await eventStatisticsService.getTimelineStatistics(filters);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve timeline statistics'
      });
    }
  }

  /**
   * Get dashboard summary statistics
   * GET /api/events/statistics/dashboard
   */
  async getDashboardStatistics(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const result = await eventStatisticsService.getDashboardStatistics(filters);

      return res.status(200).json({
        success: result.success,
        data: result.dashboard
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve dashboard statistics'
      });
    }
  }
}

module.exports = new EventStatisticsController();

