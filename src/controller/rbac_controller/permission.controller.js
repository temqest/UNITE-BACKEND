/**
 * Permission Controller
 * Handles HTTP requests related to permission management
 */

const { Permission } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');

class PermissionController {
  /**
   * Get all permissions
   * GET /api/permissions
   */
  async getAllPermissions(req, res) {
    try {
      const permissions = await Permission.find().sort({ resource: 1, action: 1 });
      return res.status(200).json({ success: true, data: permissions });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get permissions'
      });
    }
  }

  /**
   * Get permission by ID
   * GET /api/permissions/:permissionId
   */
  async getPermissionById(req, res) {
    try {
      const { permissionId } = req.params;
      const permission = await Permission.findById(permissionId);
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      return res.status(200).json({ success: true, data: permission });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get permission'
      });
    }
  }

  /**
   * Create a new permission
   * POST /api/permissions
   */
  async createPermission(req, res) {
    try {
      const permissionData = req.validatedData || req.body;
      const permission = new Permission(permissionData);
      await permission.save();
      
      return res.status(201).json({
        success: true,
        message: 'Permission created successfully',
        data: permission
      });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Permission with this code already exists'
        });
      }
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create permission'
      });
    }
  }

  /**
   * Update permission
   * PUT /api/permissions/:permissionId
   */
  async updatePermission(req, res) {
    try {
      const { permissionId } = req.params;
      const updateData = req.validatedData || req.body;

      const permission = await Permission.findByIdAndUpdate(permissionId, updateData, {
        new: true,
        runValidators: true
      });

      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update permission'
      });
    }
  }

  /**
   * Delete permission
   * DELETE /api/permissions/:permissionId
   */
  async deletePermission(req, res) {
    try {
      const { permissionId } = req.params;
      const permission = await Permission.findByIdAndDelete(permissionId);
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Permission deleted successfully'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete permission'
      });
    }
  }

  /**
   * Check if user has permission
   * POST /api/permissions/check
   */
  async checkPermission(req, res) {
    try {
      const { resource, action, locationId } = req.validatedData || req.body;
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const hasPermission = await permissionService.checkPermission(
        userId,
        resource,
        action,
        { locationId }
      );

      return res.status(200).json({
        success: true,
        data: { hasPermission }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to check permission'
      });
    }
  }
}

module.exports = new PermissionController();
