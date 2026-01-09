/**
 * Role Controller
 * Handles HTTP requests related to role management
 */

const { Role, Permission, UserRole, User } = require('../../models');
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
      
      // Check if role exists
      const existingRole = await Role.findById(roleId);
      if (!existingRole) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Only roles with authority >= 80 (system admin level) cannot be edited
      // Coordinator and Stakeholder (authority < 80) can be edited
      if (existingRole.authority >= 80) {
        return res.status(400).json({
          success: false,
          message: 'Roles with authority level 80 or higher cannot be edited. They are locked for system integrity.'
        });
      }

      const updateData = req.validatedData || req.body;

      // Prevent changing isSystemRole flag or code for any role
      if (updateData.isSystemRole !== undefined && updateData.isSystemRole !== existingRole.isSystemRole) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change system role status'
        });
      }

      if (updateData.code !== undefined && updateData.code !== existingRole.code) {
        return res.status(400).json({
          success: false,
          message: 'Cannot change role code'
        });
      }

      const role = await Role.findByIdAndUpdate(roleId, updateData, {
        new: true,
        runValidators: true
      });

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
      
      // Check UserRole collection (authoritative source)
      const activeUserRoleCount = await UserRole.countDocuments({
        roleId,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      });

      // Also check embedded roles in User model (for comprehensive count)
      const usersWithEmbeddedRole = await User.countDocuments({
        'roles.roleId': roleId,
        'roles.isActive': true
      });

      // Return the maximum count to ensure we catch all users
      const totalUserCount = Math.max(activeUserRoleCount, usersWithEmbeddedRole);
      
      return res.status(200).json({
        success: true,
        data: { userCount: totalUserCount }
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
      
      // Check if role exists
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent deleting base system roles (system-admin, coordinator, stakeholder)
      // These are essential roles that the system depends on
      const baseRoleCodes = ['system-admin', 'coordinator', 'stakeholder'];
      if (baseRoleCodes.includes(role.code)) {
        return res.status(400).json({
          success: false,
          message: `The "${role.name}" role cannot be deleted. Base system roles are locked for system integrity.`
        });
      }

      // Check for active user assignments in UserRole collection
      const activeUserRoleCount = await UserRole.countDocuments({
        roleId,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      });

      // Also check embedded roles in User model (for comprehensive check)
      const usersWithEmbeddedRole = await User.countDocuments({
        'roles.roleId': roleId,
        'roles.isActive': true
      });

      const totalUserCount = Math.max(activeUserRoleCount, usersWithEmbeddedRole);

      if (totalUserCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role: ${totalUserCount} user(s) are currently assigned to this role. Please reassign users before deleting.`,
          data: { userCount: totalUserCount }
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
