const { Role, Permission, UserRole } = require('../../models/index');

class PermissionService {
  /**
   * Check if a user has a specific permission
   * @param {string|ObjectId} userId - User ID
   * @param {string} resource - Resource name (e.g., 'event', 'request', 'user')
   * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete', 'review', 'approve')
   * @param {Object} context - Optional context (e.g., { locationId: ObjectId })
   * @returns {Promise<boolean>} True if user has permission
   */
  async checkPermission(userId, resource, action, context = {}) {
    try {
      // 1. Get all active roles for user
      let userRoles = await UserRole.find({ 
        userId, 
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      if (userRoles.length === 0) {
        return false;
      }

      // 2. Check location scope if provided
      if (context.locationId) {
        userRoles = await this.filterByLocationScope(userRoles, context.locationId);
      }

      // 3. Aggregate permissions from all roles
      const permissions = await this.aggregatePermissions(userRoles);

      // 4. Check if permission exists
      return permissions.some(p => {
        // Handle wildcard permissions
        if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes(action))) {
          return true;
        }
        if (p.resource === resource && (p.actions.includes('*') || p.actions.includes(action))) {
          return true;
        }
        return false;
      });
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user with optional location scope
   * @param {string|ObjectId} userId - User ID
   * @param {ObjectId} locationScope - Optional location ID to filter by
   * @returns {Promise<Array>} Array of permission objects
   */
  async getUserPermissions(userId, locationScope = null) {
    try {
      let userRoles = await UserRole.find({ 
        userId, 
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      if (locationScope) {
        userRoles = await this.filterByLocationScope(userRoles, locationScope);
      }

      return await this.aggregatePermissions(userRoles);
    } catch (error) {
      console.error('Error getting user permissions:', error);
      return [];
    }
  }

  /**
   * Assign a role to a user
   * @param {string|ObjectId} userId - User ID
   * @param {string|ObjectId} roleId - Role ID
   * @param {Array<ObjectId>} locationScope - Optional array of location IDs
   * @param {string|ObjectId} assignedBy - User ID who assigned the role
   * @param {Date} expiresAt - Optional expiration date
   * @returns {Promise<Object>} Created UserRole document
   */
  async assignRole(userId, roleId, locationScope = [], assignedBy = null, expiresAt = null) {
    try {
      // Verify role exists
      const role = await Role.findById(roleId);
      if (!role) {
        throw new Error('Role not found');
      }

      // Check if user already has this role (active)
      const existingRole = await UserRole.findOne({
        userId,
        roleId,
        isActive: true
      });

      if (existingRole) {
        // Update existing role assignment
        existingRole.locationScope = locationScope;
        existingRole.assignedBy = assignedBy;
        existingRole.expiresAt = expiresAt;
        existingRole.assignedAt = new Date();
        return await existingRole.save();
      }

      // Create new role assignment
      const userRole = new UserRole({
        userId,
        roleId,
        assignedBy,
        expiresAt,
        context: {
          locationScope: locationScope || []
        }
      });

      return await userRole.save();
    } catch (error) {
      throw new Error(`Failed to assign role: ${error.message}`);
    }
  }

  /**
   * Revoke a role from a user
   * @param {string|ObjectId} userId - User ID
   * @param {string|ObjectId} roleId - Role ID (optional, if not provided, revokes all roles)
   * @returns {Promise<Object>} Update result
   */
  async revokeRole(userId, roleId = null) {
    try {
      const query = { userId, isActive: true };
      if (roleId) {
        query.roleId = roleId;
      }

      return await UserRole.updateMany(query, { isActive: false });
    } catch (error) {
      throw new Error(`Failed to revoke role: ${error.message}`);
    }
  }

  /**
   * Find users who have a specific permission
   * @param {string} permission - Permission code (e.g., 'request.review') or object with resource and action
   * @param {ObjectId} locationScope - Optional location ID to filter by
   * @returns {Promise<Array>} Array of user IDs
   */
  async getUsersWithPermission(permission, locationScope = null) {
    try {
      let resource, action;
      
      // Handle permission string format (e.g., 'request.review')
      if (typeof permission === 'string') {
        const parts = permission.split('.');
        resource = parts[0];
        action = parts[1];
      } else {
        resource = permission.resource;
        action = permission.action;
      }

      // Get all roles that have this permission
      const roles = await Role.find({
        $or: [
          { 'permissions.resource': '*', 'permissions.actions': { $in: ['*', action] } },
          { 'permissions.resource': resource, 'permissions.actions': { $in: ['*', action] } }
        ]
      });

      if (roles.length === 0) {
        return [];
      }

      const roleIds = roles.map(r => r._id);

      // Get all user roles with these role IDs
      let userRoles = await UserRole.find({
        roleId: { $in: roleIds },
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      // Filter by location scope if provided
      if (locationScope) {
        userRoles = await this.filterByLocationScope(userRoles, locationScope);
      }

      // Extract unique user IDs
      const userIds = [...new Set(userRoles.map(ur => ur.userId.toString()))];
      return userIds;
    } catch (error) {
      console.error('Error getting users with permission:', error);
      return [];
    }
  }

  /**
   * Get all roles for a user
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<Array>} Array of role documents
   */
  async getUserRoles(userId) {
    try {
      const userRoles = await UserRole.find({
        userId,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      return userRoles.map(ur => ur.roleId).filter(r => r !== null);
    } catch (error) {
      console.error('Error getting user roles:', error);
      return [];
    }
  }

  /**
   * Aggregate permissions from user roles
   * @private
   * @param {Array} userRoles - Array of UserRole documents with populated roleId
   * @returns {Promise<Array>} Array of permission objects
   */
  async aggregatePermissions(userRoles) {
    const permissionsMap = new Map();

    for (const userRole of userRoles) {
      const role = userRole.roleId;
      if (!role || !role.permissions) continue;

      for (const perm of role.permissions) {
        const key = `${perm.resource}:${perm.actions.join(',')}`;
        if (!permissionsMap.has(key)) {
          permissionsMap.set(key, {
            resource: perm.resource,
            actions: [...perm.actions]
          });
        } else {
          // Merge actions
          const existing = permissionsMap.get(key);
          const newActions = [...new Set([...existing.actions, ...perm.actions])];
          permissionsMap.set(key, {
            resource: perm.resource,
            actions: newActions
          });
        }
      }
    }

    return Array.from(permissionsMap.values());
  }

  /**
   * Filter user roles by location scope
   * @private
   * @param {Array} userRoles - Array of UserRole documents
   * @param {ObjectId} locationId - Location ID to check
   * @returns {Promise<Array>} Filtered array of UserRole documents
   */
  async filterByLocationScope(userRoles, locationId) {
    const { Location, UserLocation } = require('../../models');
    const locationService = require('../utility_services/location.service');
    
    // Get all user IDs from userRoles
    const userIds = [...new Set(userRoles.map(ur => ur.userId.toString()))];
    
    // For each user, check if they have access to the location
    const validUserRoles = [];
    
    for (const userRole of userRoles) {
      const userId = userRole.userId.toString();
      const locationScope = userRole.context?.locationScope || [];
      
      // If no location scope is set in the role, check UserLocation assignments
      if (locationScope.length === 0) {
        // Check if user has location assignment that grants access
        const hasAccess = await locationService.checkLocationAccess(userId, locationId);
        if (hasAccess) {
          validUserRoles.push(userRole);
        }
      } else {
        // Check if locationId is in the role's locationScope
        const inScope = locationScope.some(locId => locId.toString() === locationId.toString());
        
        if (inScope) {
          validUserRoles.push(userRole);
        } else {
          // Also check if any scope location is an ancestor/descendant of the target location
          // This allows hierarchical access
          let hasHierarchicalAccess = false;
          for (const scopeLocId of locationScope) {
            const scopeLocation = await Location.findById(scopeLocId);
            if (!scopeLocation) continue;
            
            // Check if target location is a descendant of scope location
            const descendants = await locationService.getLocationDescendants(scopeLocId);
            if (descendants.some(d => d._id.toString() === locationId.toString())) {
              hasHierarchicalAccess = true;
              break;
            }
            
            // Check if target location is an ancestor of scope location
            const ancestors = await locationService.getLocationAncestors(scopeLocId);
            if (ancestors.some(a => a._id.toString() === locationId.toString())) {
              hasHierarchicalAccess = true;
              break;
            }
          }
          
          if (hasHierarchicalAccess) {
            validUserRoles.push(userRole);
          }
        }
      }
    }
    
    return validUserRoles;
  }

  /**
   * Create a new role
   * @param {Object} roleData - Role data
   * @returns {Promise<Object>} Created role
   */
  async createRole(roleData) {
    try {
      const role = new Role(roleData);
      return await role.save();
    } catch (error) {
      throw new Error(`Failed to create role: ${error.message}`);
    }
  }

  /**
   * Get role by code
   * @param {string} code - Role code
   * @returns {Promise<Object|null>} Role document or null
   */
  async getRoleByCode(code) {
    try {
      return await Role.findOne({ code: code.toLowerCase() });
    } catch (error) {
      console.error('Error getting role by code:', error);
      return null;
    }
  }

  /**
   * Get all roles
   * @returns {Promise<Array>} Array of role documents
   */
  async getAllRoles() {
    try {
      return await Role.find().sort({ name: 1 });
    } catch (error) {
      console.error('Error getting all roles:', error);
      return [];
    }
  }
}

module.exports = new PermissionService();
