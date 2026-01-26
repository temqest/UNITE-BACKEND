/**
 * Permission-Based Reschedule Service
 * 
 * Provides utilities for determining reschedule loop participants based on permissions
 * rather than hard-coded role names. This ensures that any role with the same functional
 * capabilities will trigger the correct workflow loop.
 * 
 * CORE PRINCIPLE:
 * - Requesters: Users with `request.create` or `request.initiate` permissions
 * - Reviewers: Users with `request.review` or `request.approve` permissions
 * - The reschedule loop alternates between these two groups based on who last acted
 */

const permissionService = require('../users_services/permission.service');
const { User } = require('../../models/index');
const { AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');

class PermissionBasedRescheduleService {
  /**
   * Permission codes that define a "Requester" (creator/initiator)
   */
  static REQUESTER_PERMISSIONS = ['request.create', 'request.initiate'];

  /**
   * Permission codes that define a "Reviewer" (reviewer/approver)
   */
  static REVIEWER_PERMISSIONS = ['request.review', 'request.approve'];

  /**
   * Check if a user has any requester permission
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Context { locationId, coverageAreaId }
   * @returns {Promise<boolean>}
   */
  static async isRequester(userId, context = {}) {
    for (const permission of this.REQUESTER_PERMISSIONS) {
      const [resource, action] = permission.split('.');
      const hasPermission = await permissionService.checkPermission(
        userId,
        resource,
        action,
        context
      );
      if (hasPermission) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a user has any reviewer permission
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Context { locationId, coverageAreaId }
   * @returns {Promise<boolean>}
   */
  static async isReviewer(userId, context = {}) {
    for (const permission of this.REVIEWER_PERMISSIONS) {
      const [resource, action] = permission.split('.');
      const hasPermission = await permissionService.checkPermission(
        userId,
        resource,
        action,
        context
      );
      if (hasPermission) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a user has permission to perform a specific action
   * @param {string|ObjectId} userId - User ID
   * @param {string} resource - Resource (e.g., 'request')
   * @param {string} action - Action (e.g., 'reschedule', 'confirm')
   * @param {Object} context - Context { locationId, coverageAreaId }
   * @returns {Promise<boolean>}
   */
  static async hasPermission(userId, resource, action, context = {}) {
    return await permissionService.checkPermission(userId, resource, action, context);
  }

  /**
   * Determine the user's functional role in the reschedule workflow
   * Returns: 'requester', 'reviewer', or 'both'
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Context { locationId, coverageAreaId }
   * @returns {Promise<'requester'|'reviewer'|'both'|null>}
   */
  static async getUserWorkflowRole(userId, context = {}) {
    const isReq = await this.isRequester(userId, context);
    const isRev = await this.isReviewer(userId, context);

    if (isReq && isRev) return 'both';
    if (isReq) return 'requester';
    if (isRev) return 'reviewer';
    return null;
  }

  /**
   * Determine the next active responder in a reschedule loop
   * 
   * LOGIC:
   * 1. If the last actor was the original requester, the next responder is from the reviewer group
   * 2. If the last actor was from the reviewer group, the next responder is the original requester
   * 3. For jurisdiction-aware reviewer selection, use coverage area and authority
   * 
   * @param {Object} request - Request document
   * @param {string|ObjectId} lastActorId - User who last performed an action
   * @param {Object} context - Context { locationId, coverageAreaId }
   * @returns {Promise<{userId: ObjectId, relationship: string, authority: number}|null>}
   */
  static async determineNextResponder(request, lastActorId, context = {}) {
    const requesterId = request.requester?.userId?.toString();
    const reviewerId = request.reviewer?.userId?.toString();
    const lastActorIdStr = lastActorId?.toString();

    // Determine if last actor was the original requester
    const lastActorWasRequester = lastActorIdStr === requesterId;

    // Get user and check permissions
    const actorWorkflowRole = await this.getUserWorkflowRole(lastActorIdStr, {
      locationId: request.municipalityId,
      coverageAreaId: request.coverageAreaId
    });

    // Case 1: Last actor was the original requester (has request.create permission)
    // Next responder should be from the reviewer group
    if (lastActorWasRequester || actorWorkflowRole === 'requester') {
      // Return the assigned reviewer or any valid reviewer
      if (reviewerId && request.reviewer) {
        const reviewerUserId = request.reviewer.userId._id || request.reviewer.userId;
        return {
          userId: reviewerUserId,
          relationship: 'reviewer',
          authority: request.reviewer.authoritySnapshot || null
        };
      }
      return null;
    }

    // Case 2: Last actor was from the reviewer group (has request.review/approve permission)
    // Next responder should be the original requester
    if (actorWorkflowRole === 'reviewer' || actorWorkflowRole === 'both') {
      if (requesterId && request.requester) {
        const requesterUserId = request.requester.userId._id || request.requester.userId;
        return {
          userId: requesterUserId,
          relationship: 'requester',
          authority: request.requester.authoritySnapshot || null
        };
      }
      return null;
    }

    // Fallback: Cannot determine - return requester as default
    if (requesterId && request.requester) {
      const requesterUserId = request.requester.userId._id || request.requester.userId;
      return {
        userId: requesterUserId,
        relationship: 'requester',
        authority: request.requester.authoritySnapshot || null
      };
    }

    return null;
  }

  /**
   * Check if a user is the original requester of a request
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @returns {boolean}
   */
  static isOriginalRequester(userId, request) {
    const userIdStr = userId?.toString();
    const requesterId = request.requester?.userId?.toString();
    return userIdStr === requesterId;
  }

  /**
   * Check if a user is the assigned reviewer of a request
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @returns {boolean}
   */
  static isAssignedReviewer(userId, request) {
    const userIdStr = userId?.toString();
    const reviewerId = request.reviewer?.userId?.toString();
    return userIdStr === reviewerId;
  }

  /**
   * Check if a user is a valid coordinator for a request (broadcast model)
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @returns {boolean}
   */
  static isValidCoordinator(userId, request) {
    const userIdStr = userId?.toString();
    if (!request.validCoordinators || request.validCoordinators.length === 0) {
      return false;
    }
    return request.validCoordinators.some(
      coord => coord.userId?.toString() === userIdStr && coord.isActive !== false
    );
  }

  /**
   * Get user's authority level
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<number>} Authority level (20, 30, 60, 80, 100)
   */
  static async getUserAuthority(userId) {
    const user = await User.findById(userId).select('authority').lean();
    return user?.authority || AUTHORITY_TIERS.BASIC_USER;
  }

  /**
   * Determine if actor can participate in reschedule loop
   * Checks both permissions and jurisdiction (coverage area)
   * 
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @returns {Promise<{canParticipate: boolean, reason?: string, workflowRole?: string}>}
   */
  static async canParticipateInRescheduleLoop(userId, request) {
    const userIdStr = userId?.toString();
    
    // Original requester can always participate
    if (this.isOriginalRequester(userIdStr, request)) {
      return {
        canParticipate: true,
        workflowRole: 'requester'
      };
    }

    // Check if user has reviewer permissions
    const context = {
      locationId: request.municipalityId,
      coverageAreaId: request.coverageAreaId
    };

    const hasReviewPermission = await this.isReviewer(userIdStr, context);
    if (!hasReviewPermission) {
      return {
        canParticipate: false,
        reason: 'User does not have review permissions'
      };
    }

    // Assigned reviewer can participate
    if (this.isAssignedReviewer(userIdStr, request)) {
      return {
        canParticipate: true,
        workflowRole: 'reviewer'
      };
    }

    // Valid coordinators (broadcast model) can participate
    if (this.isValidCoordinator(userIdStr, request)) {
      return {
        canParticipate: true,
        workflowRole: 'reviewer'
      };
    }

    // Check authority level for admins
    const userAuthority = await this.getUserAuthority(userIdStr);
    if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
      // Admins with sufficient authority can participate as secondary reviewers
      return {
        canParticipate: true,
        workflowRole: 'reviewer'
      };
    }

    return {
      canParticipate: false,
      reason: 'User is not authorized to participate in this request workflow'
    };
  }
}

module.exports = PermissionBasedRescheduleService;
