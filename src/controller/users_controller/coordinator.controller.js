const coordinatorService = require('../../services/users_services/coordinator.service');

/**
 * Coordinator Controller
 * Handles all HTTP requests related to coordinator operations
 */
class CoordinatorController {
  /**
   * Create a new coordinator account
   * POST /api/coordinators
   */
  async createCoordinatorAccount(req, res) {
    try {
      const { staffData, coordinatorData, createdByAdminId } = req.body;
      
      const result = await coordinatorService.createCoordinatorAccount(
        staffData,
        coordinatorData,
        createdByAdminId
      );

      return res.status(201).json({
        success: result.success,
        message: result.message,
        data: result.coordinator,
        credentials: result.credentials
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create coordinator account'
      });
    }
  }

  /**
   * Get coordinator by ID
   * GET /api/coordinators/:coordinatorId
   */
  async getCoordinatorById(req, res) {
    try {
      const { coordinatorId } = req.params;
      
      const result = await coordinatorService.getCoordinatorById(coordinatorId);

      return res.status(200).json({
        success: result.success,
        data: result.coordinator
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Coordinator not found'
      });
    }
  }

  /**
   * Get all coordinators with filtering and pagination
   * GET /api/coordinators
   */
  async getAllCoordinators(req, res) {
    try {
      const filters = {
        district_id: req.query.district_id
      };
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await coordinatorService.getAllCoordinators(filters, page, limit);

      return res.status(200).json({
        success: result.success,
        data: result.coordinators,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve coordinators'
      });
    }
  }

  /**
   * Update coordinator information
   * PUT /api/coordinators/:coordinatorId
   */
  async updateCoordinator(req, res) {
    try {
      const { coordinatorId } = req.params;
      const updateData = req.body;
      
      const result = await coordinatorService.updateCoordinator(coordinatorId, updateData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.coordinator
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update coordinator'
      });
    }
  }

  /**
   * Get coordinator dashboard
   * GET /api/coordinators/:coordinatorId/dashboard
   */
  async getCoordinatorDashboard(req, res) {
    try {
      const { coordinatorId } = req.params;
      
      const result = await coordinatorService.getCoordinatorDashboard(coordinatorId);

      return res.status(200).json({
        success: result.success,
        data: result.dashboard
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve dashboard'
      });
    }
  }

  /**
   * Delete/deactivate coordinator account
   * DELETE /api/coordinators/:coordinatorId
   */
  async deleteCoordinator(req, res) {
    try {
      const { coordinatorId } = req.params;
      
      const result = await coordinatorService.deleteCoordinator(coordinatorId);

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete coordinator'
      });
    }
  }

  /**
   * Get coordinator event history
   * GET /api/coordinators/:coordinatorId/events/history
   */
  async getCoordinatorEventHistory(req, res) {
    try {
      const { coordinatorId } = req.params;
      const filters = {
        status: req.query.status,
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await coordinatorService.getCoordinatorEventHistory(
        coordinatorId,
        filters,
        page,
        limit
      );

      return res.status(200).json({
        success: result.success,
        data: result.events,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve event history'
      });
    }
  }
}

module.exports = new CoordinatorController();

