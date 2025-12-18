/**
 * User Role Controller
 * Handles HTTP requests related to user role assignments
 */

const { User, UserRole, Role } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');

class UserRoleController {
  /**
   * Get all roles assigned to a user
   * GET /api/users/:userId/roles
   */
  async getUserRoles(req, res) {
    try {
      const { userId } = req.params;
      const roles = await permissionService.getUserRoles(userId);
      
      return res.status(200).json({
        success: true,
        data: roles
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user roles'
      });
    }
  }

  /**
   * Assign role to user
   * POST /api/users/:userId/roles
   */
  async assignRole(req, res) {
    try {
      const { userId } = req.params;
      const { roleId, locationScope = [], expiresAt } = req.validatedData || req.body;
      const assignedBy = req.user?.id || req.user?._id;

      // Verify user exists
      const user = await User.findById(userId) || await User.findByLegacyId(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify role exists
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      const userRole = await permissionService.assignRole(
        user._id,
        roleId,
        locationScope,
        assignedBy,
        expiresAt ? new Date(expiresAt) : null
      );

      return res.status(201).json({
        success: true,
        message: 'Role assigned successfully',
        data: userRole
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to assign role'
      });
    }
  }

  /**
   * Revoke role from user
   * DELETE /api/users/:userId/roles/:roleId
   */
  async revokeRole(req, res) {
    try {
      const { userId, roleId } = req.params;

      // Verify user exists
      const user = await User.findById(userId) || await User.findByLegacyId(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      await permissionService.revokeRole(user._id, roleId);

      return res.status(200).json({
        success: true,
        message: 'Role revoked successfully'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to revoke role'
      });
    }
  }

  /**
   * Get user permissions
   * GET /api/users/:userId/permissions
   */
  async getUserPermissions(req, res) {
    try {
      const { userId } = req.params;
      const { locationScope } = req.query;

      // Verify user exists
      const user = await User.findById(userId) || await User.findByLegacyId(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const permissions = await permissionService.getUserPermissions(
        user._id,
        locationScope || null
      );

      return res.status(200).json({
        success: true,
        data: {
          userId: user._id,
          permissions,
          locationScope: locationScope || null
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user permissions'
      });
    }
  }
}

module.exports = new UserRoleController();
