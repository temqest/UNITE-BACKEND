const systemAdminService = require('../../services/users_services/systemAdmin.service');

/**
 * System Admin Controller
 * Handles all HTTP requests related to system admin operations
 */
class SystemAdminController {
  /**
   * Create a new system admin account
   * POST /api/admin
   */
  async createSystemAdminAccount(req, res) {
    try {
      const { staffData, adminData, createdByAdminId } = req.body;
      
      const result = await systemAdminService.createSystemAdminAccount(
        staffData,
        adminData,
        createdByAdminId
      );

      return res.status(201).json({
        success: true,
        message: result.message,
        data: result.admin,
        credentials: result.credentials
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create admin account'
      });
    }
  }

  /**
   * Get admin by ID
   * GET /api/admin/:adminId
   */
  async getAdminById(req, res) {
    try {
      const { adminId } = req.params;
      
      const result = await systemAdminService.getAdminById(adminId);

      return res.status(200).json({
        success: result.success,
        data: result.admin
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Admin not found'
      });
    }
  }

  /**
   * Get all admins
   * GET /api/admin
   */
  async getAllAdmins(req, res) {
    try {
      const result = await systemAdminService.getAllAdmins();

      return res.status(200).json({
        success: result.success,
        data: result.admins
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve admins'
      });
    }
  }

  /**
   * Update admin information
   * PUT /api/admin/:adminId
   */
  async updateAdmin(req, res) {
    try {
      const { adminId } = req.params;
      const updateData = req.body;
      
      const result = await systemAdminService.updateAdmin(adminId, updateData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.admin
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update admin'
      });
    }
  }

  /**
   * Get admin dashboard
   * GET /api/admin/:adminId/dashboard
   */
  async getAdminDashboard(req, res) {
    try {
      const { adminId } = req.params;
      
      const result = await systemAdminService.getAdminDashboard(adminId);

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
   * Get system-wide statistics
   * GET /api/admin/statistics
   */
  async getSystemStatistics(req, res) {
    try {
      const result = await systemAdminService.getSystemStatistics();

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
   * Delete admin account
   * DELETE /api/admin/:adminId
   */
  async deleteAdmin(req, res) {
    try {
      const { adminId } = req.params;
      
      const result = await systemAdminService.deleteAdmin(adminId);

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete admin'
      });
    }
  }

  /**
   * Get managed coordinators
   * GET /api/admin/:adminId/coordinators
   */
  async getManagedCoordinators(req, res) {
    try {
      const { adminId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      
      const result = await systemAdminService.getManagedCoordinators(adminId, page, limit);

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
   * Create coordinator account (delegates to coordinator service)
   * POST /api/admin/:adminId/coordinators
   */
  async createCoordinatorAccount(req, res) {
    try {
      const { adminId } = req.params;
      const { staffData, coordinatorData } = req.body;
      
      const result = await systemAdminService.createCoordinatorAccount(
        staffData,
        coordinatorData,
        adminId
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
   * Get requests requiring admin attention
   * GET /api/admin/:adminId/requests/attention
   */
  async getRequestsRequiringAttention(req, res) {
    try {
      const { adminId } = req.params;
      const limit = parseInt(req.query.limit) || 20;
      
      const result = await systemAdminService.getRequestsRequiringAttention(adminId, limit);

      return res.status(200).json({
        success: result.success,
        data: result.requests
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve requests'
      });
    }
  }
}

module.exports = new SystemAdminController();

