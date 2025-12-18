/**
 * Role Controller
 * Handles HTTP requests related to role management
 */

const { Role, Permission } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');

class RoleController {
  /**
   * Get all roles
   * GET /api/roles
   */
  async getAllRoles(req, res) {
    try {
      const roles = await permissionService.getAllRoles();
      return res.status(200).json({ success: true, data: roles });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get roles'
      });
    }
  }

  /**
   * Get role by ID
   * GET /api/roles/:roleId
   */
  async getRoleById(req, res) {
    try {
      const { roleId } = req.params;
      const role = await Role.findById(roleId);
      
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      return res.status(200).json({ success: true, data: role });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get role'
      });
    }
  }

  /**
   * Create a new role
   * POST /api/roles
   */
  async createRole(req, res) {
    try {
      const roleData = req.validatedData || req.body;
      const role = await permissionService.createRole(roleData);
      
      return res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: role
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create role'
      });
    }
  }

  /**
   * Update role
   * PUT /api/roles/:roleId
   */
  async updateRole(req, res) {
    try {
      const { roleId } = req.params;
      const updateData = req.validatedData || req.body;

      const role = await Role.findByIdAndUpdate(roleId, updateData, {
        new: true,
        runValidators: true
      });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Role updated successfully',
        data: role
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update role'
      });
    }
  }

  /**
   * Delete role
   * DELETE /api/roles/:roleId
   */
  async deleteRole(req, res) {
    try {
      const { roleId } = req.params;
      
      // Check if role is a system role (should not be deleted)
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      if (role.isSystemRole) {
        return res.status(400).json({
          success: false,
          message: 'System roles cannot be deleted'
        });
      }

      await Role.findByIdAndDelete(roleId);

      return res.status(200).json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete role'
      });
    }
  }
}

module.exports = new RoleController();
