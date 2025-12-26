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
      const { AUTHORITY_TIERS } = require('../users_services/authority.service');

      // 1.5. If admin explicitly provided coordinatorId, use it directly
      if (context.coordinatorId && requesterAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        const coordinator = await this._getUser(context.coordinatorId);
        if (!coordinator) {
          throw new Error(`Coordinator with ID ${context.coordinatorId} not found`);
        }
        
        // Validate coordinator has required permissions
        const rule = this._getAssignmentRule(context.requestType || 'eventRequest');
        const requiredPermissions = rule.requiredPermissions || ['request.review'];
        
        // Check if coordinator has at least one required permission
        let hasPermission = false;
        for (const permission of requiredPermissions) {
          const [resource, action] = permission.split('.');
          const hasPerm = await permissionService.checkPermission(
            coordinator._id,
            resource,
            action,
            { locationId }
          );
          if (hasPerm) {
            hasPermission = true;
            break;
          }
        }
        
        if (!hasPermission) {
          console.warn(`[REVIEWER ASSIGNMENT] Selected coordinator ${context.coordinatorId} does not have required permissions. Falling back to auto-assignment.`);
        } else {
          // Coordinator is valid, return it
          const formattedReviewer = await this._formatReviewer(coordinator);
          console.log(
            `[REVIEWER ASSIGNED] Admin (ID: ${requesterId}) explicitly selected coordinator: ${formattedReviewer.name} (authority: ${formattedReviewer.authority || 'N/A'})`
          );
          return {
            ...formattedReviewer,
            autoAssigned: false,
            assignmentRule: 'admin-selected-coordinator', // Clear rule name for audit
            authority: formattedReviewer.authority || coordinator.authority || 60
          };
        }
      }

      // 2. Determine target reviewer authority tier based on requester authority
      // EXACT BUSINESS RULES:
      // - Stakeholder-level (30-59): Route to Coordinator-level (≥60) with request.review + org/coverage match
      // - Coordinator-level (60-79): Route to Admin-level (≥80) with request.review
      // - Admin-level (≥80): Route to Coordinator-level (≥60) with execution responsibility
      let targetAuthorityMin = 20;
      let targetAuthorityMax = 100;
      let requiresOrgMatch = false;
      let requiresCoverageMatch = false;

      if (requesterAuthority >= AUTHORITY_TIERS.STAKEHOLDER && requesterAuthority < AUTHORITY_TIERS.COORDINATOR) {
        // Stakeholder-level: Route to Coordinator-level (≥60)
        targetAuthorityMin = AUTHORITY_TIERS.COORDINATOR; // 60
        targetAuthorityMax = AUTHORITY_TIERS.OPERATIONAL_ADMIN - 1; // < 80
        requiresOrgMatch = true;
        requiresCoverageMatch = true;
      } else if (requesterAuthority >= AUTHORITY_TIERS.COORDINATOR && requesterAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Coordinator-level: Route to Admin-level (≥80)
        targetAuthorityMin = AUTHORITY_TIERS.OPERATIONAL_ADMIN; // 80
        targetAuthorityMax = 100;
      } else if (requesterAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Admin-level: Route to Coordinator-level (≥60) for execution
        targetAuthorityMin = AUTHORITY_TIERS.COORDINATOR; // 60
        targetAuthorityMax = AUTHORITY_TIERS.OPERATIONAL_ADMIN - 1; // < 80
      }

      // 3. Get assignment rule for request type
      const rule = this._getAssignmentRule(context.requestType || 'eventRequest');
      const requiredPermissions = rule.requiredPermissions || ['request.review'];

      // 4. Find users with required permissions in same location scope
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

      // 5. FILTER BY TARGET AUTHORITY TIER (based on business rules)
      let qualifiedByAuthority = candidateReviewers.filter(candidate => {
        const candidateAuthority = candidate.authority ?? 20;
        return candidateAuthority >= targetAuthorityMin && candidateAuthority <= targetAuthorityMax;
      });

      // If no one meets target authority requirement, try to find closest match
      if (qualifiedByAuthority.length === 0) {
        console.warn(
          `[AUTHORITY MISMATCH] No reviewers with authority ${targetAuthorityMin}-${targetAuthorityMax} for requester authority ${requesterAuthority}. Looking for closest match.`
        );
        // Fallback: find reviewers with authority >= requester authority (hierarchy requirement)
        qualifiedByAuthority = candidateReviewers.filter(candidate => {
          const candidateAuthority = candidate.authority ?? 20;
          return candidateAuthority >= requesterAuthority;
        });
        
        if (qualifiedByAuthority.length === 0) {
          // Last resort: use highest authority candidate
          candidateReviewers.sort((a, b) => (b.authority ?? 20) - (a.authority ?? 20));
          qualifiedByAuthority = [candidateReviewers[0]];
        }
      }

      // 6. Apply organization and coverage matching for stakeholder requests
      let reviewersToConsider = qualifiedByAuthority;
      if (requiresOrgMatch || requiresCoverageMatch) {
        reviewersToConsider = await this._filterByOrganizationAndCoverage(
          qualifiedByAuthority,
          requester,
          context
        );
        
        if (reviewersToConsider.length === 0) {
          console.warn(
            `[ORG/COVERAGE MISMATCH] No reviewers match organization/coverage requirements. Using authority-filtered candidates.`
          );
          reviewersToConsider = qualifiedByAuthority;
        }
      }

      // 7. Apply assignment rules (priority order if specified)
      const reviewer = await this._applyAssignmentRules(
        reviewersToConsider,
        requesterId,
        context,
        rule
      );

      console.log(
        `[REVIEWER ASSIGNED] Reviewer ${reviewer.name} (authority ${reviewer.authority ?? 'N/A'}) assigned to requester ${requester.firstName || requester.name} (authority ${requesterAuthority}) [Rule: ${requesterAuthority >= AUTHORITY_TIERS.STAKEHOLDER && requesterAuthority < AUTHORITY_TIERS.COORDINATOR ? 'Stakeholder→Coordinator' : requesterAuthority >= AUTHORITY_TIERS.COORDINATOR && requesterAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN ? 'Coordinator→Admin' : 'Admin→Coordinator'}]`
      );

      // Determine assignment rule name based on routing logic
      let assignmentRuleName = 'auto-assigned';
      if (requesterAuthority >= AUTHORITY_TIERS.STAKEHOLDER && requesterAuthority < AUTHORITY_TIERS.COORDINATOR) {
        assignmentRuleName = 'stakeholder-to-coordinator';
      } else if (requesterAuthority >= AUTHORITY_TIERS.COORDINATOR && requesterAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        assignmentRuleName = 'coordinator-to-admin';
      } else if (requesterAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        assignmentRuleName = 'admin-to-coordinator';
      }
      
      return {
        ...reviewer,
        autoAssigned: true,
        assignmentRule: assignmentRuleName,
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

    // Get user details (including authority, organizations, and coverageAreas for filtering)
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
    }).select('_id userId firstName lastName email authority roles organizations coverageAreas locations').lean();

    return users;
  }

  /**
   * Filter reviewers by organization and coverage matching (for stakeholder requests)
   * @private
   */
  async _filterByOrganizationAndCoverage(candidateReviewers, requester, context = {}) {
    const filtered = [];
    
    // Get requester's organizations and coverage areas
    const requesterOrgIds = new Set();
    if (requester.organizations && requester.organizations.length > 0) {
      requester.organizations.forEach(org => {
        if (org.isActive !== false && org.organizationId) {
          requesterOrgIds.add(org.organizationId.toString());
        }
      });
    }
    
    const requesterMunicipalityIds = new Set();
    if (requester.locations && requester.locations.municipalityId) {
      requesterMunicipalityIds.add(requester.locations.municipalityId.toString());
    }
    
    // Also check coverage areas if requester has them
    if (requester.coverageAreas && requester.coverageAreas.length > 0) {
      requester.coverageAreas.forEach(ca => {
        if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
          ca.municipalityIds.forEach(muniId => {
            if (muniId) {
              requesterMunicipalityIds.add(muniId.toString());
            }
          });
        }
      });
    }
    
    // Check each candidate reviewer
    for (const candidate of candidateReviewers) {
      let orgMatch = false;
      let coverageMatch = false;
      
      // Check organization match
      if (requesterOrgIds.size > 0) {
        const candidateOrgIds = new Set();
        if (candidate.organizations && candidate.organizations.length > 0) {
          candidate.organizations.forEach(org => {
            if (org.isActive !== false && org.organizationId) {
              candidateOrgIds.add(org.organizationId.toString());
            }
          });
        }
        
        // Check if there's any organization overlap
        for (const requesterOrgId of requesterOrgIds) {
          if (candidateOrgIds.has(requesterOrgId)) {
            orgMatch = true;
            break;
          }
        }
      } else {
        // If requester has no organizations, skip org matching
        orgMatch = true;
      }
      
      // Check coverage/match municipality match
      if (requesterMunicipalityIds.size > 0) {
        const candidateMunicipalityIds = new Set();
        
        // Check coordinator's coverage areas
        if (candidate.coverageAreas && candidate.coverageAreas.length > 0) {
          candidate.coverageAreas.forEach(ca => {
            if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
              ca.municipalityIds.forEach(muniId => {
                if (muniId) {
                  candidateMunicipalityIds.add(muniId.toString());
                }
              });
            }
          });
        }
        
        // Check if there's any municipality overlap
        for (const requesterMuniId of requesterMunicipalityIds) {
          if (candidateMunicipalityIds.has(requesterMuniId)) {
            coverageMatch = true;
            break;
          }
        }
      } else {
        // If requester has no municipality, skip coverage matching
        coverageMatch = true;
      }
      
      // Include reviewer if both matches are satisfied (or if matching not required)
      if (orgMatch && coverageMatch) {
        filtered.push(candidate);
      }
    }
    
    return filtered;
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
    // Use role-based lookup directly (more reliable than permission-based for fallback)
    // This ensures we always find system admin users even if permission structure changes
    const { Role } = require('../../models');
    const role = await Role.findOne({ code: fallbackRole });
    if (!role) {
      console.warn(`[FALLBACK REVIEWER] Role '${fallbackRole}' not found`);
      return null;
    }

    const { UserRole } = require('../../models');
    const userRoles = await UserRole.find({ 
      roleId: role._id, 
      isActive: true 
    }).limit(1);

    if (userRoles.length === 0) {
      console.warn(`[FALLBACK REVIEWER] No active users found with role '${fallbackRole}'`);
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
   * Includes organizations and coverageAreas for matching
   * @private
   */
  async _getUser(userId) {
    const mongoose = require('mongoose');
    
    // Try as ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId).select('_id userId firstName lastName email authority roles organizations coverageAreas locations isActive').lean();
      if (user) return user;
    }

    // Try as legacy userId
    const user = await User.findByLegacyId(userId);
    if (user) {
      // Convert to plain object and ensure we have the needed fields
      return user.toObject ? user.toObject() : user;
    }
    return null;
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

