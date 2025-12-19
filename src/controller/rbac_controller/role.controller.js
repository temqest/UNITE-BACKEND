/**
 * Role Controller
 * Handles HTTP requests related to role management
 */

const { Role, Permission, UserRole } = require('../../models');
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
   * Get count of users assigned to a role
   * GET /api/roles/:roleId/users-count
   */
  async getRoleUsersCount(req, res) {
    try {
      const { roleId } = req.params;
      
      const activeUserCount = await UserRole.countDocuments({
        roleId,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      });
      
      return res.status(200).json({
        success: true,
        data: { userCount: activeUserCount }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user count'
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

      // Check for active user assignments
      const activeUserCount = await UserRole.countDocuments({
        roleId,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      });

      if (activeUserCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role: ${activeUserCount} user(s) are currently assigned to this role`,
          data: { userCount: activeUserCount }
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
