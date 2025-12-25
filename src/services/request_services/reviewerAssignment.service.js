/**
 * Reviewer Assignment Service (RBAC-Based)
 * 
 * Handles configurable reviewer assignment based on RBAC permissions and business rules.
 * Uses PermissionService to find users with required permissions instead of hard-coded roles.
 */

const { User } = require('../../models/index');
const permissionService = require('../users_services/permission.service');
const locationService = require('../utility_services/location.service');
const assignmentRules = require('../../config/reviewerAssignmentRules');

class ReviewerAssignmentService {
  /**
   * Assign a reviewer to a request based on PERMISSIONS and AUTHORITY HIERARCHY
   * (Not role names)
   * 
   * Selection process:
   * 1. Find all users with REQUEST_REVIEW permission in location scope
   * 2. Filter by authority hierarchy (reviewer authority >= requester authority)
   * 3. Apply priority rules if specified
   * 4. Return highest-priority qualified reviewer
   * 5. Fallback to system admin if no suitable reviewer found
   * 
   * @param {string|ObjectId} requesterId - ID of the requester (User._id or legacy ID)
   * @param {Object} context - Additional context { locationId, requestType, stakeholderId, authority, etc. }
   * @returns {Promise<Object>} Reviewer assignment { userId, id, role, roleSnapshot, name, autoAssigned, assignmentRule, authority }
   */
  async assignReviewer(requesterId, context = {}) {
    try {
      // 1. Get requester's details including authority
      const requester = await this._getUser(requesterId);
      if (!requester) {
        throw new Error(`Requester with ID ${requesterId} not found`);
      }

      const requesterAuthority = requester.authority ?? 20; // Default authority = 20
      const locationId = context.locationId || context.district;

      // 2. Get assignment rule for request type
      const rule = this._getAssignmentRule(context.requestType || 'eventRequest');
      const requiredPermissions = rule.requiredPermissions || ['request.review'];

      // 3. Find users with required permissions in same location scope
      const candidateReviewers = await this._findUsersWithPermissions(
        requiredPermissions,
        locationId,
        rule.locationScope || 'same-or-parent',
        rule.excludeRequester ? requesterId : null
      );

      if (candidateReviewers.length === 0) {
        // Fallback to system admin
        console.warn(`[REVIEWER ASSIGNMENT] No candidates found for ${context.requestType || 'eventRequest'}, using system admin fallback`);
        const fallbackReviewer = await this._assignFallbackReviewer(rule.fallbackReviewer || 'system-admin');
        if (fallbackReviewer) {
          return {
            ...fallbackReviewer,
            autoAssigned: true,
            assignmentRule: context.requestType || 'default',
            authority: fallbackReviewer.authority || 100
          };
        }
        throw new Error('Unable to assign reviewer: no suitable reviewer found and fallback failed');
      }

      // 4. FILTER BY AUTHORITY HIERARCHY
      // Reviewer authority must be >= requester authority
      const qualifiedByAuthority = candidateReviewers.filter(candidate => {
        const candidateAuthority = candidate.authority ?? 20;
        return candidateAuthority >= requesterAuthority;
      });

      // If no one meets authority requirement, log warning and use highest authority candidate
      let reviewersToConsider = qualifiedByAuthority;
      if (qualifiedByAuthority.length === 0) {
        console.warn(
          `[AUTHORITY MISMATCH] No reviewers with authority >= ${requesterAuthority} (requester authority). Using highest-authority candidate.`
        );
        candidateReviewers.sort((a, b) => (b.authority ?? 20) - (a.authority ?? 20));
        reviewersToConsider = [candidateReviewers[0]];
      }

      // 5. Apply assignment rules (priority order if specified)
      const reviewer = await this._applyAssignmentRules(
        reviewersToConsider,
        requesterId,
        context,
        rule
      );

      console.log(
        `[REVIEWER ASSIGNED] Reviewer ${reviewer.name} (authority ${reviewer.authority ?? 'N/A'}) assigned to requester ${requester.firstName || requester.name} (authority ${requesterAuthority})`
      );

      return {
        ...reviewer,
        autoAssigned: true,
        assignmentRule: context.requestType || 'default',
        authority: reviewer.authority || (await this._getUser(reviewer.userId || reviewer.id))?.authority || 20
      };
    } catch (error) {
      console.error(`Failed to assign reviewer: ${error.message}`);
      throw new Error(`Failed to assign reviewer: ${error.message}`);
    }
  }

  /**
   * Get assignment rule for request type
   * @private
   */
  _getAssignmentRule(requestType) {
    return assignmentRules[requestType] || assignmentRules.default;
  }

  /**
   * Find users with required permissions in location scope
   * Now includes authority information for hierarchy filtering
   * @private
   */
  async _findUsersWithPermissions(requiredPermissions, locationId, locationScope, excludeUserId = null) {
    const userIds = new Set();

    // For each required permission, find users who have it
    for (const permission of requiredPermissions) {
      const usersWithPerm = await permissionService.getUsersWithPermission(permission, locationId);
      usersWithPerm.forEach(id => userIds.add(id));
    }

    // Filter by location scope if provided
    if (locationId && locationScope !== 'any') {
      const filteredUserIds = [];
      for (const userId of userIds) {
        const hasAccess = await this._checkLocationScope(userId, locationId, locationScope);
        if (hasAccess) {
          filteredUserIds.push(userId);
        }
      }
      userIds.clear();
      filteredUserIds.forEach(id => userIds.add(id));
    }

    // Exclude requester if specified
    if (excludeUserId) {
      const excludeId = excludeUserId.toString();
      userIds.delete(excludeId);
    }

    // Get user details (including authority for hierarchy filtering)
    const mongoose = require('mongoose');
    const users = await User.find({ 
      _id: { $in: Array.from(userIds).map(id => {
        try {
          return mongoose.Types.ObjectId(id);
        } catch (e) {
          return id;
        }
      }) },
      isActive: true 
    }).select('_id userId firstName lastName email authority roles').lean();

    return users;
  }

  /**
   * Check if user has access to location based on scope
   * @private
   */
  async _checkLocationScope(userId, locationId, scope) {
    if (scope === 'any') return true;
    
    const userLocations = await locationService.getUserLocations(userId);
    if (userLocations.includes(locationId.toString())) {
      return true;
    }

    if (scope === 'same-or-parent') {
      // Check if location is a parent of any user location
      const { Location } = require('../../models');
      for (const userLocId of userLocations) {
        const ancestors = await locationService.getLocationAncestors(userLocId);
        if (ancestors.some(a => a._id.toString() === locationId.toString())) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Apply assignment rules to select reviewer from candidates
   * Considers both permissions AND authority hierarchy
   * Selection priority: 1) Permission-based priority, 2) Authority level (prefer lower-authority sufficient reviewer)
   * @private
   */
  async _applyAssignmentRules(candidateReviewers, requesterId, context, rule) {
    if (candidateReviewers.length === 0) {
      throw new Error('No candidate reviewers available');
    }

    // If permission-based priority order is specified, sort by priority
    if (rule.priority && Array.isArray(rule.priority) && rule.priority.length > 0) {
      // Check if priority is permission-based (new format) or role-based (legacy)
      const isPermissionBased = rule.priority[0] && typeof rule.priority[0] === 'object' && rule.priority[0].permissions;
      
      if (isPermissionBased) {
        // Permission-based priority: sort by permission weight, then by authority
        const candidatesWithPriority = await Promise.all(
          candidateReviewers.map(async (user) => {
            const userPermissions = await permissionService.getUserPermissions(user._id, context.locationId);
            const permissionSet = new Set();
            userPermissions.forEach(perm => {
              if (perm.resource === '*') {
                permissionSet.add('*');
              } else {
                perm.actions.forEach(action => {
                  if (action === '*') {
                    permissionSet.add(`${perm.resource}.*`);
                  } else {
                    permissionSet.add(`${perm.resource}.${action}`);
                  }
                });
              }
            });
            
            // Find the highest priority (lowest weight) that matches user's permissions
            let bestPriority = Infinity;
            for (const priorityRule of rule.priority) {
              const requiredPerms = priorityRule.permissions || [];
              const hasAllPerms = requiredPerms.every(perm => {
                if (perm === '*') return permissionSet.has('*');
                return permissionSet.has(perm) || permissionSet.has('*');
              });
              
              if (hasAllPerms && priorityRule.weight < bestPriority) {
                bestPriority = priorityRule.weight;
              }
            }
            
            return { 
              user, 
              priority: bestPriority, 
              authority: user.authority ?? 20 
            };
          })
        );

        // Sort by priority (ascending) first, then by authority (ascending, prefer lower sufficient authority)
        candidatesWithPriority.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority; // Better priority first
          }
          // If same priority, prefer lower-authority sufficient reviewer (hierarchy: use least powerful)
          return a.authority - b.authority;
        });
        
        const selectedUser = candidatesWithPriority[0].user;
        return await this._formatReviewer(selectedUser);
      } else {
        // Legacy role-based priority (for backward compatibility, but warn)
        console.warn('[DEPRECATED] Role-based priority rules detected. Consider migrating to permission-based priority.');
        const priorityMap = {};
        rule.priority.forEach((roleCode, index) => {
          priorityMap[roleCode] = index;
        });

        const candidatesWithRoles = await Promise.all(
          candidateReviewers.map(async (user) => {
            const roles = await permissionService.getUserRoles(user._id);
            const roleCodes = roles.map(r => r.code);
            const minPriority = Math.min(
              ...roleCodes.map(code => priorityMap[code] ?? Infinity)
            );
            return { user, priority: minPriority, authority: user.authority ?? 20 };
          })
        );

        candidatesWithRoles.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          return a.authority - b.authority;
        });
        
        const selectedUser = candidatesWithRoles[0].user;
        return await this._formatReviewer(selectedUser);
      }
    }

    // Default: return first candidate (or if multiple, prefer lower authority)
    if (candidateReviewers.length > 1) {
      candidateReviewers.sort((a, b) => (a.authority ?? 20) - (b.authority ?? 20));
    }
    return await this._formatReviewer(candidateReviewers[0]);
  }

  /**
   * Format user as reviewer object with authority information
   * @private
   */
  async _formatReviewer(user) {
    const roles = await permissionService.getUserRoles(user._id);
    const primaryRole = roles[0]; // Get first role as primary

    return {
      userId: user._id,
      id: user.userId || user._id.toString(), // Legacy ID support
      role: primaryRole?.code || null,
      roleSnapshot: primaryRole?.code || null,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      authority: user.authority || 20 // Include authority for hierarchy checks
    };
  }

  /**
   * Assign fallback reviewer (users with full access permissions)
   * @private
   */
  async _assignFallbackReviewer(fallbackRole = 'system-admin') {
    // Try to find users with full access permissions first
    const usersWithFullAccess = await permissionService.getUsersWithPermission('*', null);
    if (usersWithFullAccess.length > 0) {
      const user = await User.findById(usersWithFullAccess[0]);
      if (user) {
        return await this._formatReviewer(user);
      }
    }

    // Fallback: use role-based lookup for backward compatibility
    const { Role } = require('../../models');
    const role = await Role.findOne({ code: fallbackRole });
    if (!role) {
      return null;
    }

    const { UserRole } = require('../../models');
    const userRoles = await UserRole.find({ 
      roleId: role._id, 
      isActive: true 
    }).limit(1);

    if (userRoles.length === 0) {
      return null;
    }

    const user = await User.findById(userRoles[0].userId);
    if (user) {
      return await this._formatReviewer(user);
    }

    return null;
  }

  /**
   * Get user by ID (supports both ObjectId and legacy userId)
   * @private
   */
  async _getUser(userId) {
    const mongoose = require('mongoose');
    
    // Try as ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      if (user) return user;
    }

    // Try as legacy userId
    return await User.findByLegacyId(userId);
  }

  /**
   * Override reviewer assignment (admin override with permission and authority validation)
   * Ensures override is done by authorized user and new reviewer has appropriate authority
   * @param {string|ObjectId} newReviewerId - New reviewer ID (User._id or legacy ID)
   * @param {string} overrideBy - ID of admin performing override
   * @param {Object} context - Optional context { requesterId, locationId } for authority validation
   * @returns {Promise<Object>} Updated reviewer assignment with override metadata
   */
  async overrideReviewer(newReviewerId, overrideBy, context = {}) {
    // 1. Check if overrideBy has PERMISSION to override
    const overrideUser = await this._getUser(overrideBy);
    if (!overrideUser) {
      throw new Error(`Override user with ID ${overrideBy} not found`);
    }

    const canOverride = await permissionService.checkPermission(
      overrideBy,
      'request',
      'review',
      { locationId: context.locationId }
    );

    // Also allow if user is system admin (authority >= 100)
    const isSystemAdmin = overrideUser.authority >= 100;
    
    if (!canOverride && !isSystemAdmin) {
      throw new Error('Only users with request.review permission or system administrators can override reviewer assignments');
    }

    // 2. Get and validate new reviewer
    const reviewer = await this._getUser(newReviewerId);
    if (!reviewer) {
      throw new Error(`Reviewer with ID ${newReviewerId} not found`);
    }

    // 3. Check authority hierarchy if context provided
    if (context.requesterId) {
      const requester = await this._getUser(context.requesterId);
      if (requester) {
        const requesterAuthority = requester.authority ?? 20;
        const reviewerAuthority = reviewer.authority ?? 20;

        if (reviewerAuthority < requesterAuthority && !isSystemAdmin) {
          throw new Error(
            `Cannot assign reviewer with authority ${reviewerAuthority} to request from user with authority ${requesterAuthority}. ` +
            `Reviewer authority must be >= requester authority.`
          );
        }

        if (reviewerAuthority < requesterAuthority && isSystemAdmin) {
          console.warn(
            `[OVERRIDE WARNING] System admin ${overrideBy} overriding authority check: assigning reviewer with authority ${reviewerAuthority} to request from user with authority ${requesterAuthority}`
          );
        }
      }
    }

    const formatted = await this._formatReviewer(reviewer);
    const overrideRoles = await permissionService.getUserRoles(overrideUser._id);
    const overrideRole = overrideRoles[0];

    console.log(
      `[REVIEWER OVERRIDE] Override performed by ${overrideUser.firstName || overrideUser.name} ` +
      `(authority ${overrideUser.authority || 'N/A'}) assigning ${formatted.name} (authority ${formatted.authority || 'N/A'})`
    );

    return {
      ...formatted,
      autoAssigned: false,
      overriddenAt: new Date(),
      overriddenBy: {
        userId: overrideUser._id,
        id: overrideUser.userId || overrideUser._id.toString(),
        role: overrideRole?.code || null,
        roleSnapshot: overrideRole?.code || null,
        name: `${overrideUser.firstName || ''} ${overrideUser.lastName || ''}`.trim() || overrideUser.email,
        authority: overrideUser.authority || 20
      }
    };
  }

  // ========== LEGACY METHODS (DEPRECATED - Use assignReviewer() instead) ==========
  // These methods are kept for backward compatibility but should not be used
  // for new implementations. They rely on the new permission-based assignReviewer()
  // instead of hardcoded role checks.

  /**
   * @deprecated Use assignReviewer() with context.requestType = 'eventRequest' instead
   */
  async assignCoordinatorReviewer(coordinatorId = null) {
    console.warn('[DEPRECATED] assignCoordinatorReviewer() is deprecated. Use assignReviewer() with proper context instead.');
    
    // If specific coordinatorId provided, try to use them (backward compatibility)
    if (coordinatorId) {
      try {
        const user = await this._getUser(coordinatorId);
        if (user) {
          // Verify they have REQUEST_REVIEW permission
          const hasReviewPerm = await permissionService.checkPermission(user._id, 'request', 'review', {});
          if (hasReviewPerm) {
            return await this._formatReviewer(user);
          }
        }
      } catch (e) {
        // Fall through to permission-based lookup
      }
    }

    // Permission-based approach: find user with REQUEST_REVIEW permission
    const usersWithReviewPerm = await permissionService.getUsersWithPermission('request.review', null);
    if (usersWithReviewPerm.length > 0) {
      const user = await User.findById(usersWithReviewPerm[0]);
      if (user) {
        return await this._formatReviewer(user);
      }
    }

    // Fallback to system admin
    return await this._assignFallbackReviewer('system-admin');
  }

  /**
   * @deprecated Use assignReviewer() instead (system admin is used as fallback automatically)
   */
  async assignSystemAdminReviewer() {
    console.warn('[DEPRECATED] assignSystemAdminReviewer() is deprecated. Use assignReviewer() with proper context instead.');
    return await this._assignFallbackReviewer('system-admin');
  }
}

module.exports = new ReviewerAssignmentService();

