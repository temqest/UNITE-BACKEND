const permissionService = require('./permission.service');
const { Role } = require('../../models/index');

/**
 * Authority Service
 * 
 * Calculates and validates user authority levels based on permissions.
 * Authority determines who can view/manage whom in the system hierarchy.
 * 
 * Authority Tiers:
 * - SYSTEM_ADMIN (100): Has *.* permission
 * - OPERATIONAL_ADMIN (80): Can manage all staff types
 * - COORDINATOR (60): Has operational capabilities
 * - STAKEHOLDER (30): Has review-only capabilities
 * - BASIC_USER (20): Minimal permissions
 */
class AuthorityService {
  // Authority tier constants
  static AUTHORITY_TIERS = {
    SYSTEM_ADMIN: 100,
    OPERATIONAL_ADMIN: 80,
    COORDINATOR: 60,
    STAKEHOLDER: 30,
    BASIC_USER: 20
  };

  /**
   * Get user authority (uses persisted field, calculates only if missing)
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Optional context (deprecated, kept for backward compatibility)
   * @returns {Promise<number>} Authority tier (20-100)
   */
  async calculateUserAuthority(userId, context = {}) {
    try {
      const { User } = require('../../models/index');
      const mongoose = require('mongoose');
      
      // Try to find user
      let user = null;
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      
      if (!user) {
        user = await User.findByLegacyId(userId);
      }
      
      if (!user) {
        console.log(`[AUTH] User not found: ${userId}, returning BASIC_USER`);
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }
      
      // System admin check (highest priority)
      if (user.isSystemAdmin) {
        return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
      }
      
      // Use persisted authority field if available and valid
      // OPTIMIZATION: For new users, authority should already be set during creation
      if (user.authority && user.authority !== 20) {
        return user.authority;
      }
      
      // Fallback: Calculate from embedded roles (fast path - no database query needed)
      // This should only happen if authority field is missing or default
      if (user.roles && user.roles.length > 0) {
        const activeRoles = user.roles.filter(r => r.isActive !== false);
        if (activeRoles.length > 0) {
          const maxAuthority = Math.max(...activeRoles.map(r => r.roleAuthority || 20));
          console.log(`[AUTH] Calculated authority ${maxAuthority} from ${activeRoles.length} embedded roles for ${user.email} (fast path)`);
          return maxAuthority;
        }
      }
      
      // Only log if we need to calculate from permissions (slow path)
      console.log(`[AUTH] User ${user.email} has no persisted authority or embedded roles, calculating from permissions (slow path)...`);
      
      // If roles array is empty or has no active roles, default to BASIC_USER (20)
      // Do NOT calculate from permissions for new users - this can incorrectly assign coordinator authority (60)
      console.log(`[AUTH] User ${user.email} has no active roles, defaulting to BASIC_USER (20)`);
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    } catch (error) {
      console.error('[AUTH] Error calculating user authority:', error.message);
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    }
  }

  /**
   * Legacy method: Calculate authority from permissions (fallback only)
   * @private
   */
  async _calculateFromPermissions(userId) {
    try {
      const permissions = await permissionService.getUserPermissions(userId, null);
      
      if (permissions.length === 0) {
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }

      // Check for system admin (wildcard permission)
      if (permissions.some(p => p.resource === '*' && p.actions.includes('*'))) {
        return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
      }

      // Check for operational admin
      const staffPerms = permissions.filter(p => p.resource === 'staff');
      const hasOperationalAdmin = staffPerms.some(p => {
        const hasCreateOrUpdate = p.actions.includes('create') || p.actions.includes('update');
        const canManageAllTypes = !p.metadata?.allowedStaffTypes || 
                                  p.metadata.allowedStaffTypes.includes('*') ||
                                  p.metadata.allowedStaffTypes.length === 0;
        return hasCreateOrUpdate && canManageAllTypes;
      });

      if (hasOperationalAdmin) {
        return AuthorityService.AUTHORITY_TIERS.OPERATIONAL_ADMIN;
      }

      // Check for stakeholder (review-only)
      const hasReview = permissions.some(p => {
        if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes('review'))) {
          return true;
        }
        if (p.resource === 'request' && (p.actions.includes('*') || p.actions.includes('review'))) {
          return true;
        }
        return false;
      });

      // Check for coordinator (operational capabilities)
      const operationalCapabilities = [
        { resource: 'request', action: 'create' },
        { resource: 'event', action: 'create' },
        { resource: 'event', action: 'update' },
        { resource: 'staff', action: 'create' },
        { resource: 'staff', action: 'update' }
      ];

      const hasOperational = permissions.some(p => {
        return operationalCapabilities.some(cap => {
          if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes(cap.action))) {
            return true;
          }
          if (p.resource === cap.resource && (p.actions.includes('*') || p.actions.includes(cap.action))) {
            return true;
          }
          return false;
        });
      });

      if (hasReview && !hasOperational) {
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      if (hasOperational) {
        return AuthorityService.AUTHORITY_TIERS.COORDINATOR;
      }

      if (hasReview) {
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    } catch (error) {
      console.error('[AUTH] Error calculating from permissions:', error.message);
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    }
  }

  /**
   * Get role authority (uses persisted field, calculates only if missing)
   * @param {string|ObjectId} roleId - Role ID
   * @returns {Promise<number>} Authority tier (20-100)
   */
  async calculateRoleAuthority(roleId) {
    try {
      const role = await Role.findById(roleId);
      
      if (!role) {
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }
      
      // Use persisted authority field if available and valid
      if (role.authority && role.authority !== 20) {
        return role.authority;
      }
      
      // Fallback: Calculate from permissions (for backward compatibility during migration)
      return await this._calculateRoleAuthorityFromPermissions(role);
    } catch (error) {
      console.error('[AUTH] Error calculating role authority:', error.message);
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    }
  }

  /**
   * Legacy method: Calculate role authority from permissions (fallback only)
   * @private
   */
  async _calculateRoleAuthorityFromPermissions(role) {
    if (!role.permissions || role.permissions.length === 0) {
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    }

    const permissions = role.permissions.map(perm => ({
      resource: perm.resource,
      actions: perm.actions || [],
      metadata: perm.metadata || {}
    }));

    // Check for system admin (wildcard permission)
    if (permissions.some(p => p.resource === '*' && p.actions.includes('*'))) {
      return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
    }

    // Check for operational admin
    const staffPerms = permissions.filter(p => p.resource === 'staff');
    const hasOperationalAdmin = staffPerms.some(p => {
      const hasCreateOrUpdate = p.actions.includes('create') || p.actions.includes('update');
      const canManageAllTypes = !p.metadata?.allowedStaffTypes || 
                                p.metadata.allowedStaffTypes.includes('*') ||
                                p.metadata.allowedStaffTypes.length === 0;
      return hasCreateOrUpdate && canManageAllTypes;
    });

    if (hasOperationalAdmin) {
      return AuthorityService.AUTHORITY_TIERS.OPERATIONAL_ADMIN;
    }

    // Check for stakeholder (review-only)
    const hasReview = permissions.some(p => {
      if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes('review'))) {
        return true;
      }
      if (p.resource === 'request' && (p.actions.includes('*') || p.actions.includes('review'))) {
        return true;
      }
      return false;
    });

    // Check for coordinator (operational capabilities)
    const operationalCapabilities = [
      { resource: 'request', action: 'create' },
      { resource: 'event', action: 'create' },
      { resource: 'staff', action: 'create' }
    ];

    const hasOperational = permissions.some(p => {
      return operationalCapabilities.some(cap => {
        if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes(cap.action))) {
          return true;
        }
        if (p.resource === cap.resource && (p.actions.includes('*') || p.actions.includes(cap.action))) {
          return true;
        }
        return false;
      });
    });

    if (hasReview && !hasOperational) {
      return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
    }

    if (hasOperational) {
      return AuthorityService.AUTHORITY_TIERS.COORDINATOR;
    }

    if (hasReview) {
      return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
    }

    return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
  }

  /**
   * Check if a viewer can view a target user
   * @param {string|ObjectId} viewerId - Viewer's user ID
   * @param {string|ObjectId} targetUserId - Target user's ID
   * @param {Object} context - Optional context
   * @returns {Promise<boolean>} True if viewer can see target
   */
  async canViewUser(viewerId, targetUserId, context = {}) {
    try {
      // System admins can view everyone
      const viewerAuthority = await this.calculateUserAuthority(viewerId, context);
      if (viewerAuthority === AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return true;
      }

      // Check if viewer has higher authority than target
      const targetAuthority = await this.calculateUserAuthority(targetUserId, context);
      return viewerAuthority > targetAuthority;
    } catch (error) {
      console.error('Error checking view permission:', error);
      return false;
    }
  }

  /**
   * Check if an assigner can assign a role
   * @param {string|ObjectId} assignerId - Assigner's user ID
   * @param {string|ObjectId} roleId - Role ID to assign
   * @param {Object} context - Optional context
   * @returns {Promise<boolean>} True if assigner can assign role
   */
  async canAssignRole(assignerId, roleId, context = {}) {
    try {
      // System admins can assign any role
      const assignerAuthority = await this.calculateUserAuthority(assignerId, context);
      if (assignerAuthority === AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return true;
      }

      // Check if assigner has higher authority than role
      const roleAuthority = await this.calculateRoleAuthority(roleId);
      return assignerAuthority > roleAuthority;
    } catch (error) {
      console.error('Error checking role assignment permission:', error);
      return false;
    }
  }

  /**
   * Filter user IDs by authority (exclude users with equal/higher authority than viewer)
   * @param {string|ObjectId} viewerId - Viewer's user ID
   * @param {Array<string|ObjectId>} userIds - Array of user IDs to filter
   * @param {Object} context - Optional context
   * @param {boolean} allowEqualAuthority - If true, allows viewing users with equal authority (for staff management)
   * @returns {Promise<Array<string|ObjectId>>} Filtered array of user IDs
   */
  async filterUsersByAuthority(viewerId, userIds, context = {}, allowEqualAuthority = false) {
    try {
      if (!userIds || userIds.length === 0) {
        return [];
      }

      // Operational admins (authority ≥ 80) and system admins can see everyone
      const viewerAuthority = await this.calculateUserAuthority(viewerId, context);
      if (viewerAuthority >= 80) {
        console.log('[DIAG] filterUsersByAuthority - Admin bypass:', {
          viewerId: viewerId.toString(),
          viewerAuthority,
          userIdsCount: userIds.length
        });
        return userIds;
      }

      // Filter users with lower authority (or equal if allowEqualAuthority is true)
      const filteredIds = [];
      const filteredOutByAuthority = [];
      
      // Batch get authorities (use persisted fields for performance)
      const { User } = require('../../models/index');
      const users = await User.find({ _id: { $in: userIds } });
      const userAuthorityMap = new Map();
      users.forEach(u => {
        // FIXED: Correct operator precedence - use authority if present, otherwise check isSystemAdmin
        userAuthorityMap.set(u._id.toString(), u.authority || (u.isSystemAdmin ? 100 : 20));
      });
      
      // Fill in missing users with calculated authority
      const authorities = await Promise.all(
        userIds.map(async userId => {
          const userIdStr = userId.toString();
          if (userAuthorityMap.has(userIdStr)) {
            return userAuthorityMap.get(userIdStr);
          }
          return await this.calculateUserAuthority(userId, context);
        })
      );

      for (let i = 0; i < userIds.length; i++) {
        if (allowEqualAuthority) {
          // Allow equal or lower authority (for staff management - coordinators can see other coordinators)
          if (viewerAuthority >= authorities[i]) {
            filteredIds.push(userIds[i]);
          } else {
            filteredOutByAuthority.push({
              userId: userIds[i].toString(),
              authority: authorities[i],
              reason: `Authority ${authorities[i]} >= viewer authority ${viewerAuthority}`
            });
          }
        } else {
          // Original: only lower authority (strict hierarchy)
          if (viewerAuthority > authorities[i]) {
            filteredIds.push(userIds[i]);
          } else {
            filteredOutByAuthority.push({
              userId: userIds[i].toString(),
              authority: authorities[i],
              reason: `Authority ${authorities[i]} >= viewer authority ${viewerAuthority} (strict)`
            });
          }
        }
      }

      // Enhanced diagnostic logging
      console.log('[DIAG] filterUsersByAuthority:', {
        viewerId: viewerId.toString(),
        viewerAuthority,
        viewerTier: AuthorityService.getAuthorityTierName(viewerAuthority),
        allowEqualAuthority,
        totalUsers: userIds.length,
        filteredIn: filteredIds.length,
        filteredOut: filteredOutByAuthority.length,
        authorityDistribution: {
          systemAdmin: authorities.filter(a => a === AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN).length,
          operationalAdmin: authorities.filter(a => a === AuthorityService.AUTHORITY_TIERS.OPERATIONAL_ADMIN).length,
          coordinator: authorities.filter(a => a === AuthorityService.AUTHORITY_TIERS.COORDINATOR).length,
          stakeholder: authorities.filter(a => a === AuthorityService.AUTHORITY_TIERS.STAKEHOLDER).length,
          basicUser: authorities.filter(a => a === AuthorityService.AUTHORITY_TIERS.BASIC_USER).length
        }
      });

      // Debug logging when all users are filtered out (helps diagnose permission issues)
      if (filteredIds.length === 0 && userIds.length > 0) {
        console.log('[DIAG] filterUsersByAuthority - All users filtered out:', {
          viewerId: viewerId.toString(),
          viewerAuthority,
          viewerTier: AuthorityService.getAuthorityTierName(viewerAuthority),
          userCount: userIds.length,
          userAuthorities: authorities.map((auth, idx) => ({
            userId: userIds[idx].toString(),
            authority: auth,
            tier: AuthorityService.getAuthorityTierName(auth)
          }))
        });
      }

      return filteredIds;
    } catch (error) {
      console.error('[filterUsersByAuthority] Error filtering users by authority:', error);
      // On error, return empty array for security
      return [];
    }
  }

  /**
   * Get authority tier name from numeric value
   * @param {number} authority - Authority tier value
   * @returns {string} Authority tier name
   */
  static getAuthorityTierName(authority) {
    const tiers = AuthorityService.AUTHORITY_TIERS;
    if (authority >= tiers.SYSTEM_ADMIN) return 'SYSTEM_ADMIN';
    if (authority >= tiers.OPERATIONAL_ADMIN) return 'OPERATIONAL_ADMIN';
    if (authority >= tiers.COORDINATOR) return 'COORDINATOR';
    if (authority >= tiers.STAKEHOLDER) return 'STAKEHOLDER';
    return 'BASIC_USER';
  }
}

// Export both the instance and the class/constants for flexibility
const authorityServiceInstance = new AuthorityService();
module.exports = authorityServiceInstance;
// Also export the class and constants for static access
module.exports.AuthorityService = AuthorityService;
module.exports.AUTHORITY_TIERS = AuthorityService.AUTHORITY_TIERS;

// Convenience wrappers (backwards-friendly)
// `getAuthority` returns numeric authority for a user
authorityServiceInstance.getAuthority = async function(userId, context = {}) {
  return await authorityServiceInstance.calculateUserAuthority(userId, context);
};

// `filterByLowerAuthority` filters an array of userIds to those strictly lower than viewer
authorityServiceInstance.filterByLowerAuthority = async function(viewerId, userIds, context = {}) {
  return await authorityServiceInstance.filterUsersByAuthority(viewerId, userIds, context, false);
};

