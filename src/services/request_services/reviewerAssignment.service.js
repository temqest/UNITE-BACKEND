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
   * Assign a reviewer to a request based on requester permissions and context
   * @param {string|ObjectId} requesterId - ID of the requester (User._id or legacy ID)
   * @param {Object} context - Additional context { locationId, requestType, stakeholderId, etc. }
   * @returns {Promise<Object>} Reviewer assignment { userId, id, role, roleSnapshot, name, autoAssigned, assignmentRule }
   */
  async assignReviewer(requesterId, context = {}) {
    try {
      // 1. Get requester's roles and permissions
      const requester = await this._getUser(requesterId);
      if (!requester) {
        throw new Error(`Requester with ID ${requesterId} not found`);
      }

      const requesterRoles = await permissionService.getUserRoles(requester._id);
      const requesterPermissions = await permissionService.getUserPermissions(requester._id, context.locationId);

      // 2. Determine required reviewer permissions based on request type
      const rule = this._getAssignmentRule(context.requestType || 'eventRequest');
      const requiredPermissions = rule.requiredPermissions || ['request.review'];

      // 3. Find users with required permissions in same location scope
      const candidateReviewers = await this._findUsersWithPermissions(
        requiredPermissions,
        context.locationId,
        rule.locationScope || 'same-or-parent',
        rule.excludeRequester ? requesterId : null
      );

      if (candidateReviewers.length === 0) {
        // Fallback to system admin
        const fallbackReviewer = await this._assignFallbackReviewer(rule.fallbackReviewer || 'system-admin');
        if (fallbackReviewer) {
          return {
            ...fallbackReviewer,
            autoAssigned: true,
            assignmentRule: context.requestType || 'default'
          };
        }
        throw new Error('Unable to assign reviewer: no suitable reviewer found');
      }

      // 4. Apply assignment rules (priority order if specified)
      const reviewer = await this._applyAssignmentRules(
        candidateReviewers,
        requesterId,
        context,
        rule
      );

      return {
        ...reviewer,
        autoAssigned: true,
        assignmentRule: context.requestType || 'default'
      };
    } catch (error) {
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

    // Get user details
    const users = await User.find({ 
      _id: { $in: Array.from(userIds).map(id => require('mongoose').Types.ObjectId(id)) },
      isActive: true 
    }).lean();

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
   * @private
   */
  async _applyAssignmentRules(candidateReviewers, requesterId, context, rule) {
    if (candidateReviewers.length === 0) {
      throw new Error('No candidate reviewers available');
    }

    // If priority order is specified, sort by priority
    if (rule.priority && rule.priority.length > 0) {
      const priorityMap = {};
      rule.priority.forEach((roleCode, index) => {
        priorityMap[roleCode] = index;
      });

      // Get roles for each candidate and sort by priority
      const candidatesWithRoles = await Promise.all(
        candidateReviewers.map(async (user) => {
          const roles = await permissionService.getUserRoles(user._id);
          const roleCodes = roles.map(r => r.code);
          const minPriority = Math.min(
            ...roleCodes.map(code => priorityMap[code] ?? Infinity)
          );
          return { user, priority: minPriority };
        })
      );

      candidatesWithRoles.sort((a, b) => a.priority - b.priority);
      const selectedUser = candidatesWithRoles[0].user;
      return await this._formatReviewer(selectedUser);
    }

    // Default: return first candidate
    return await this._formatReviewer(candidateReviewers[0]);
  }

  /**
   * Format user as reviewer object
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
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
    };
  }

  /**
   * Assign fallback reviewer (system admin)
   * @private
   */
  async _assignFallbackReviewer(fallbackRole = 'system-admin') {
    const { Role } = require('../../models');
    const role = await Role.findOne({ code: fallbackRole });
    if (!role) {
      return null;
    }

    // Find users with this role
    const { UserRole } = require('../../models');
    const userRoles = await UserRole.find({ 
      roleId: role._id, 
      isActive: true 
    }).limit(1);

    if (userRoles.length === 0) {
      // No users with this role found
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
   * Override reviewer assignment (admin override)
   * @param {string|ObjectId} newReviewerId - New reviewer ID (User._id or legacy ID)
   * @param {string} overrideBy - ID of admin performing override
   * @returns {Promise<Object>} Updated reviewer assignment
   */
  async overrideReviewer(newReviewerId, overrideBy) {
    // Check if overrideBy has permission to override
    const hasPermission = await permissionService.checkPermission(
      overrideBy,
      'request',
      'review',
      {}
    );

    if (!hasPermission) {
      // Also check if user is system admin
      const overrideUser = await this._getUser(overrideBy);
      if (!overrideUser || !overrideUser.isSystemAdmin) {
        throw new Error('Only users with request.review permission or system administrators can override reviewer assignments');
      }
    }

    const reviewer = await this._getUser(newReviewerId);
    if (!reviewer) {
      throw new Error(`Reviewer with ID ${newReviewerId} not found`);
    }

    const formatted = await this._formatReviewer(reviewer);
    const overrideUser = await this._getUser(overrideBy);
    const overrideRoles = await permissionService.getUserRoles(overrideUser._id);
    const overrideRole = overrideRoles[0];

    return {
      ...formatted,
      autoAssigned: false,
      overriddenAt: new Date(),
      overriddenBy: {
        userId: overrideUser._id,
        id: overrideUser.userId || overrideUser._id.toString(),
        role: overrideRole?.code || null,
        roleSnapshot: overrideRole?.code || null,
        name: `${overrideUser.firstName || ''} ${overrideUser.lastName || ''}`.trim() || overrideUser.email
      }
    };
  }

  // Legacy methods for backward compatibility
  async assignCoordinatorReviewer(coordinatorId = null) {
    // Try to find user by legacy coordinator ID
    if (coordinatorId) {
      const user = await User.findByLegacyId(coordinatorId);
      if (user) {
        return await this._formatReviewer(user);
      }
    }

    // Find any user with coordinator role
    const { Role } = require('../../models');
    const coordinatorRole = await Role.findOne({ code: 'coordinator' });
    if (coordinatorRole) {
      const { UserRole } = require('../../models');
      const userRole = await UserRole.findOne({ roleId: coordinatorRole._id, isActive: true });
      if (userRole) {
        const user = await User.findById(userRole.userId);
        if (user) {
          return await this._formatReviewer(user);
        }
      }
    }

    throw new Error('No coordinator available to assign as reviewer');
  }

  async assignSystemAdminReviewer() {
    return await this._assignFallbackReviewer('system-admin');
  }
}

module.exports = new ReviewerAssignmentService();

