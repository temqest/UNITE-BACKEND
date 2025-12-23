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
   * Calculate authority tier for a user based on their permissions
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Optional context (e.g., { locationId, coverageAreaId })
   * @returns {Promise<number>} Authority tier (20-100)
   */
  async calculateUserAuthority(userId, context = {}) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] calculateUserAuthority called with userId: ${userId}, type: ${typeof userId}`);
      
      // First, check if user has isSystemAdmin flag (highest priority)
      const { User } = require('../../models/index');
      
      // Try multiple lookup methods
      let user = null;
      const mongoose = require('mongoose');
      
      if (mongoose.Types.ObjectId.isValid(userId)) {
        console.log(`[DIAG] Attempting User.findById('${userId}')...`);
        user = await User.findById(userId);
        if (user) {
          console.log(`[DIAG] ✓ User found via findById: ${user.email} (_id: ${user._id}, isSystemAdmin: ${user.isSystemAdmin})`);
        } else {
          console.log(`[DIAG] ✗ findById returned null`);
        }
      }
      
      if (!user) {
        console.log(`[DIAG] Attempting User.findByLegacyId('${userId}')...`);
        user = await User.findByLegacyId(userId);
        if (user) {
          console.log(`[DIAG] ✓ User found via findByLegacyId: ${user.email} (_id: ${user._id}, isSystemAdmin: ${user.isSystemAdmin})`);
        } else {
          console.log(`[DIAG] ✗ findByLegacyId returned null`);
        }
      }
      
      if (!user) {
        console.log(`[DIAG] WARNING: User not found for authority calculation: ${userId}`);
        console.log(`[DIAG] Returning BASIC_USER authority as fallback`);
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }
      
      if (user && user.isSystemAdmin) {
        console.log(`[DIAG] User is system admin, returning SYSTEM_ADMIN authority`);
        return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
      }

      // Get user's effective permissions
      // Only pass context if it has actual filter values, otherwise pass null to avoid filtering out all roles
      const hasContextFilters = context && (
        context.locationId || 
        context.coverageAreaId || 
        context.geographicUnitId
      );
      const permissions = await permissionService.getUserPermissions(
        userId, 
        hasContextFilters ? context : null
      );

      // Enhanced logging for authority calculation
      console.log(`[DIAG] calculateUserAuthority - Permission resolution:`, {
        userId: userId.toString(),
        permissionsCount: permissions.length,
        permissions: permissions.map(p => ({
          resource: p.resource,
          actions: p.actions,
          metadata: p.metadata
        }))
      });

      if (permissions.length === 0) {
        console.log(`[RBAC] calculateUserAuthority - WARNING: User ${userId} has no permissions`);
        console.log(`[RBAC] calculateUserAuthority - Checking if user has roles assigned for fallback authority inference...`);
        
        // Fallback: Check if user has any role assignments and infer authority from role code
        const { UserRole, Role } = require('../../models/index');
        const userRoles = await UserRole.find({ 
          userId: user._id, 
          isActive: true 
        }).populate('roleId');
        
        console.log(`[RBAC] calculateUserAuthority - User has ${userRoles.length} active role assignments`);
        
        if (userRoles.length > 0) {
          // Try to infer authority from role codes
          let inferredAuthority = null;
          let inferredFromRole = null;
          
          for (const ur of userRoles) {
            let role = ur.roleId;
            
            // If role is not populated, try to fetch it
            if (!role || (typeof role === 'object' && !role._id)) {
              const roleId = ur.roleId;
              if (roleId) {
                role = await Role.findById(roleId);
              }
            }
            
            if (role && role.code) {
              const roleCode = role.code.toLowerCase();
              console.log(`[RBAC] calculateUserAuthority - Checking role code: ${roleCode}`);
              
              // Infer authority from role code
              if (roleCode === 'system-admin' || roleCode === 'system_admin') {
                inferredAuthority = AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
                inferredFromRole = roleCode;
                break; // Highest authority, stop checking
              } else if (roleCode === 'coordinator' && (!inferredAuthority || inferredAuthority < AuthorityService.AUTHORITY_TIERS.COORDINATOR)) {
                inferredAuthority = AuthorityService.AUTHORITY_TIERS.COORDINATOR;
                inferredFromRole = roleCode;
              } else if (roleCode === 'stakeholder' && (!inferredAuthority || inferredAuthority < AuthorityService.AUTHORITY_TIERS.STAKEHOLDER)) {
                inferredAuthority = AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
                inferredFromRole = roleCode;
              }
            }
            
            console.log(`[RBAC] calculateUserAuthority - Role assignment:`, {
              roleId: role?._id || ur.roleId,
              roleCode: role?.code,
              roleName: role?.name,
              roleIsPopulated: !!(role && role._id),
              roleHasPermissions: !!(role && role.permissions),
              permissionsCount: role?.permissions?.length || 0
            });
          }
          
          if (inferredAuthority !== null) {
            console.log(`[RBAC] calculateUserAuthority - Inferred authority ${inferredAuthority} from role code: ${inferredFromRole}`);
            console.log(`[RBAC] calculateUserAuthority - WARNING: This is a fallback - permissions should be resolved properly`);
            return inferredAuthority;
          }
        }
        
        console.log(`[RBAC] calculateUserAuthority - No roles found or unable to infer authority, returning BASIC_USER`);
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }

      // Check for system admin (wildcard permission)
      const hasWildcard = permissions.some(p => p.resource === '*' && p.actions.includes('*'));
      if (hasWildcard) {
        console.log(`[DIAG] calculateUserAuthority - User ${userId} has wildcard permission, returning SYSTEM_ADMIN`);
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
        console.log(`[DIAG] calculateUserAuthority - User ${userId} has operational admin permissions, returning OPERATIONAL_ADMIN`);
        return AuthorityService.AUTHORITY_TIERS.OPERATIONAL_ADMIN;
      }

      // Check for stakeholder (review-only capabilities) - MUST check BEFORE coordinator
      // A user is STAKEHOLDER if they have review capabilities but NO operational capabilities
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

      // If user has review but NO operational capabilities, it's a STAKEHOLDER
      if (hasReview && !hasOperational) {
        console.log(`[DIAG] calculateUserAuthority - User ${userId} has review-only capabilities, returning STAKEHOLDER`);
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      // If user has operational capabilities, it's a COORDINATOR
      if (hasOperational) {
        console.log(`[DIAG] calculateUserAuthority - User ${userId} has operational capabilities, returning COORDINATOR`);
        return AuthorityService.AUTHORITY_TIERS.COORDINATOR;
      }

      // If user only has review (but we already checked above), fall through
      if (hasReview) {
        console.log(`[DIAG] calculateUserAuthority - User ${userId} has review capabilities, returning STAKEHOLDER`);
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      // Default to basic user
      console.log(`[DIAG] calculateUserAuthority - User ${userId} has no matching authority tier, returning BASIC_USER`);
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    } catch (error) {
      console.error('[DIAG] calculateUserAuthority - ERROR:', {
        userId: userId?.toString() || 'unknown',
        error: error.message,
        stack: error.stack
      });
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
      console.log(`[DIAG] calculateRoleAuthority called with roleId: ${roleId}`);
      const role = await Role.findById(roleId);
      
      if (!role) {
        console.log(`[DIAG] calculateRoleAuthority - Role ${roleId} not found, returning BASIC_USER`);
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }
      
      // Primary method: Check role.code directly (most reliable)
      if (role.code) {
        const roleCode = role.code.toLowerCase();
        console.log(`[DIAG] calculateRoleAuthority - Checking role.code: ${roleCode}`);
        
        // Direct mapping from role code to authority
        if (roleCode === 'system-admin' || roleCode === 'system_admin') {
          console.log(`[DIAG] calculateRoleAuthority - Role ${roleCode} mapped to SYSTEM_ADMIN via role.code`);
          return AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN;
        }
        if (roleCode === 'coordinator') {
          console.log(`[DIAG] calculateRoleAuthority - Role ${roleCode} mapped to COORDINATOR via role.code`);
          return AuthorityService.AUTHORITY_TIERS.COORDINATOR;
        }
        if (roleCode === 'stakeholder') {
          console.log(`[DIAG] calculateRoleAuthority - Role ${roleCode} mapped to STAKEHOLDER via role.code`);
          return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
        }
      }
      
      // Fallback method: Calculate from permissions (if role.code doesn't match known codes)
      if (!role.permissions || role.permissions.length === 0) {
        console.log(`[DIAG] calculateRoleAuthority - Role ${role.code || roleId} has no permissions, returning BASIC_USER`);
        return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
      }
      
      console.log(`[DIAG] calculateRoleAuthority - Role ${role.code} has ${role.permissions.length} permissions, calculating from permissions`);

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

      // Check for stakeholder (review-only capabilities) - MUST check BEFORE coordinator
      // A role is STAKEHOLDER if it has review capabilities but NO operational capabilities
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

      // If role has review but NO operational capabilities, it's a STAKEHOLDER
      if (hasReview && !hasOperational) {
        console.log(`[DIAG] calculateRoleAuthority - Role ${role.code} has review-only capabilities, returning STAKEHOLDER`);
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      // If role has operational capabilities, it's a COORDINATOR
      if (hasOperational) {
        console.log(`[DIAG] calculateRoleAuthority - Role ${role.code} has operational capabilities, returning COORDINATOR`);
        return AuthorityService.AUTHORITY_TIERS.COORDINATOR;
      }

      // If role only has review (but we already checked above), fall through
      if (hasReview) {
        console.log(`[DIAG] calculateRoleAuthority - Role ${role.code} has review capabilities, returning STAKEHOLDER`);
        return AuthorityService.AUTHORITY_TIERS.STAKEHOLDER;
      }

      console.log(`[DIAG] calculateRoleAuthority - Role ${role.code} has no matching authority tier, returning BASIC_USER`);
      return AuthorityService.AUTHORITY_TIERS.BASIC_USER;
    } catch (error) {
      console.error('[DIAG] calculateRoleAuthority - ERROR:', {
        roleId: roleId?.toString() || 'unknown',
        error: error.message,
        stack: error.stack
      });
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
   * @param {boolean} allowEqualAuthority - If true, allows viewing users with equal authority (for staff management)
   * @returns {Promise<Array<string|ObjectId>>} Filtered array of user IDs
   */
  async filterUsersByAuthority(viewerId, userIds, context = {}, allowEqualAuthority = false) {
    try {
      if (!userIds || userIds.length === 0) {
        return [];
      }

      // System admins can see everyone
      const viewerAuthority = await this.calculateUserAuthority(viewerId, context);
      if (viewerAuthority === AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return userIds;
      }

      // Filter users with lower authority (or equal if allowEqualAuthority is true)
      const filteredIds = [];
      
      // Batch calculate authorities for performance
      const authorityPromises = userIds.map(userId => 
        this.calculateUserAuthority(userId, context)
      );
      const authorities = await Promise.all(authorityPromises);

      for (let i = 0; i < userIds.length; i++) {
        if (allowEqualAuthority) {
          // Allow equal or lower authority (for staff management - coordinators can see other coordinators)
          if (viewerAuthority >= authorities[i]) {
            filteredIds.push(userIds[i]);
          }
        } else {
          // Original: only lower authority (strict hierarchy)
          if (viewerAuthority > authorities[i]) {
            filteredIds.push(userIds[i]);
          }
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

