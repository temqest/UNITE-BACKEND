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
 * - STAKEHOLDER (40): Has review-only capabilities
 * - BASIC_USER (20): Minimal permissions
 */
class AuthorityService {
  // Authority tier constants
  static AUTHORITY_TIERS = {
    SYSTEM_ADMIN: 100,
    OPERATIONAL_ADMIN: 80,
    COORDINATOR: 60,
    STAKEHOLDER: 40,
    BASIC_USER: 20
  };

  /**
   * Calculate authority tier for a user based on their permissions
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Optional context (e.g., { locationId, coverageAreaId })
   * @returns {Promise<number>} Authority tier (20-100)
   */
  async calculateUserAuthority(userId, context = {}) {
    try {
      // First, check if user has isSystemAdmin flag (highest priority)
      const { User } = require('../../models/index');
      const user = await User.findById(userId);
      if (user && user.isSystemAdmin) {
        return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
      }

      // Get user's effective permissions
      const permissions = await permissionService.getUserPermissions(userId, context);

      // Debug logging for authority calculation (can be removed in production)
      if (permissions.length === 0) {
        console.log(`[calculateUserAuthority] User ${userId} has no permissions`);
      } else {
        // Log permissions for debugging (only for first few calls to avoid spam)
        const debugKey = `auth_debug_${userId}`;
        if (!this._debugLogged || !this._debugLogged[debugKey]) {
          if (!this._debugLogged) this._debugLogged = {};
          this._debugLogged[debugKey] = true;
          console.log(`[calculateUserAuthority] User ${userId} permissions:`, 
            permissions.map(p => `${p.resource}.${p.actions?.join(',') || '[]'}`));
        }
      }

      // Check for system admin (wildcard permission)
      if (permissions.some(p => p.resource === '*' && p.actions.includes('*'))) {
        return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
      }

      // Check for operational admin (can manage all staff types)
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

      // Check for coordinator (operational capabilities)
      // Must have at least one of: request.create, event.create, event.update, staff.create, staff.update
      const operationalCapabilities = [
        { resource: 'request', action: 'create' },
        { resource: 'event', action: 'create' },
        { resource: 'event', action: 'update' },
        { resource: 'staff', action: 'create' },
        { resource: 'staff', action: 'update' }
      ];

      const hasOperational = permissions.some(p => {
        return operationalCapabilities.some(cap => {
          // Check wildcard permissions
          if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes(cap.action))) {
            return true;
          }
          // Check specific resource permission
          if (p.resource === cap.resource && (p.actions.includes('*') || p.actions.includes(cap.action))) {
            return true;
          }
          return false;
        });
      });

      if (hasOperational) {
        return AuthorityService.AUTHORITY_TIERS.COORDINATOR;
      }

      // Check for stakeholder (review-only capabilities)
      const hasReview = permissions.some(p => {
        // Check wildcard permissions
        if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes('review'))) {
          return true;
        }
        // Check specific review permission
        if (p.resource === 'request' && (p.actions.includes('*') || p.actions.includes('review'))) {
          return true;
        }
        return false;
      });

      if (hasReview) {
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      // Default to basic user
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    } catch (error) {
      console.error('Error calculating user authority:', error);
      // On error, return lowest authority for security
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    }
  }

  /**
   * Calculate authority tier for a role based on its permissions
   * @param {string|ObjectId} roleId - Role ID
   * @returns {Promise<number>} Authority tier (20-100)
   */
  async calculateRoleAuthority(roleId) {
    try {
      const role = await Role.findById(roleId).populate('permissions');
      
      if (!role || !role.permissions) {
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }

      // Convert role permissions to same format as user permissions
      const permissions = role.permissions.map(perm => ({
        resource: perm.resource,
        actions: perm.actions || [],
        metadata: perm.metadata || {}
      }));

      // Check for system admin (wildcard permission)
      if (permissions.some(p => p.resource === '*' && p.actions.includes('*'))) {
        return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
      }

      // Check for operational admin (can manage all staff types)
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

      if (hasOperational) {
        return AuthorityService.AUTHORITY_TIERS.COORDINATOR;
      }

      // Check for stakeholder (review-only capabilities)
      const hasReview = permissions.some(p => {
        if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes('review'))) {
          return true;
        }
        if (p.resource === 'request' && (p.actions.includes('*') || p.actions.includes('review'))) {
          return true;
        }
        return false;
      });

      if (hasReview) {
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    } catch (error) {
      console.error('Error calculating role authority:', error);
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    }
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
   * @returns {Promise<Array<string|ObjectId>>} Filtered array of user IDs
   */
  async filterUsersByAuthority(viewerId, userIds, context = {}) {
    try {
      if (!userIds || userIds.length === 0) {
        return [];
      }

      // System admins can see everyone
      const viewerAuthority = await this.calculateUserAuthority(viewerId, context);
      if (viewerAuthority === AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return userIds;
      }

      // Filter users with lower authority
      const filteredIds = [];
      
      // Batch calculate authorities for performance
      const authorityPromises = userIds.map(userId => 
        this.calculateUserAuthority(userId, context)
      );
      const authorities = await Promise.all(authorityPromises);

      for (let i = 0; i < userIds.length; i++) {
        if (viewerAuthority > authorities[i]) {
          filteredIds.push(userIds[i]);
        }
      }

      // Debug logging when all users are filtered out (helps diagnose permission issues)
      if (filteredIds.length === 0 && userIds.length > 0) {
        console.log('[filterUsersByAuthority] All users filtered out:', {
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

module.exports = new AuthorityService();

