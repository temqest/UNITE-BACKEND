/**
 * v2.0 Request State Machine
 * 
 * Permission-based, role-agnostic state machine for event requests.
 * Uses permissionService.checkPermission() for all access decisions.
 */

const { REQUEST_STATES, REQUEST_ACTIONS, AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');
const permissionService = require('../users_services/permission.service');
const authorityService = require('../users_services/authority.service');

class V2RequestStateMachine {
  /**
   * Simplified state transitions for v2.0
   * Removed intermediate states (review-accepted, review-rejected, awaiting-confirmation)
   */
  static TRANSITIONS = {
    [REQUEST_STATES.PENDING_REVIEW]: {
      [REQUEST_ACTIONS.ACCEPT]: REQUEST_STATES.APPROVED,
      [REQUEST_ACTIONS.REJECT]: REQUEST_STATES.REJECTED,
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED
    },
    [REQUEST_STATES.REVIEW_RESCHEDULED]: {
      [REQUEST_ACTIONS.ACCEPT]: REQUEST_STATES.APPROVED,
      [REQUEST_ACTIONS.REJECT]: REQUEST_STATES.REJECTED,
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED,
      [REQUEST_ACTIONS.DECLINE]: REQUEST_STATES.REJECTED,
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED // Loop allowed
    },
    [REQUEST_STATES.APPROVED]: {
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED,
      [REQUEST_ACTIONS.CANCEL]: REQUEST_STATES.CANCELLED
    },
    [REQUEST_STATES.REJECTED]: {
      // Final state - no transitions
    },
    [REQUEST_STATES.CANCELLED]: {
      // Final state - no transitions
    }
  };

  /**
   * Check if a state transition is valid
   * @param {string} currentState - Current request state
   * @param {string} action - Action to perform
   * @returns {boolean} True if transition is valid
   */
  static isValidTransition(currentState, action) {
    const normalizedState = this.normalizeState(currentState);
    const transitions = this.TRANSITIONS[normalizedState];
    
    if (!transitions) {
      return false;
    }
    
    return transitions.hasOwnProperty(action);
  }

  /**
   * Get the next state for a transition
   * @param {string} currentState - Current request state
   * @param {string} action - Action to perform
   * @returns {string|null} Next state or null if invalid
   */
  static getNextState(currentState, action) {
    const normalizedState = this.normalizeState(currentState);
    const transitions = this.TRANSITIONS[normalizedState];
    
    if (!transitions || !transitions[action]) {
      return null;
    }
    
    return transitions[action];
  }

  /**
   * Normalize state name (handle legacy states for backward compatibility)
   * @param {string} state - State to normalize
   * @returns {string} Normalized state
   */
  static normalizeState(state) {
    if (!state) return REQUEST_STATES.PENDING_REVIEW;
    
    const normalized = String(state).toLowerCase().trim();
    
    // Map legacy states to v2.0 states
    const legacyMap = {
      'pending': REQUEST_STATES.PENDING_REVIEW,
      'pending_admin_review': REQUEST_STATES.PENDING_REVIEW,
      'pending_coordinator_review': REQUEST_STATES.PENDING_REVIEW,
      'pending_stakeholder_review': REQUEST_STATES.PENDING_REVIEW,
      'review_accepted': REQUEST_STATES.APPROVED, // Simplified: directly to approved
      'review_rejected': REQUEST_STATES.REJECTED, // Simplified: directly to rejected
      'rescheduled_by_admin': REQUEST_STATES.REVIEW_RESCHEDULED,
      'rescheduled_by_coordinator': REQUEST_STATES.REVIEW_RESCHEDULED,
      'review_rescheduled': REQUEST_STATES.REVIEW_RESCHEDULED,
      'awaiting_confirmation': REQUEST_STATES.REVIEW_RESCHEDULED, // Simplified: treat as rescheduled
      'completed': REQUEST_STATES.COMPLETED,
      'cancelled': REQUEST_STATES.CANCELLED
    };
    
    if (legacyMap[normalized]) {
      return legacyMap[normalized];
    }
    
    // Return as-is if already a valid v2.0 state
    return state;
  }

  /**
   * Check if user is the original requester
   * @param {string|ObjectId} userId - User ID to check
   * @param {Object} request - Request document
   * @returns {boolean} True if user is the requester
   */
  static isRequester(userId, request) {
    if (!userId || !request || !request.requester) {
      return false;
    }
    
    const requesterId = request.requester.userId?.toString();
    const userIdStr = userId.toString();
    
    return requesterId === userIdStr;
  }

  /**
   * Check if user has review permission for the request location
   * @param {string|ObjectId} userId - User ID to check
   * @param {Object} request - Request document
   * @param {string|ObjectId} locationId - Location ID (municipality or district)
   * @returns {Promise<boolean>} True if user can review
   */
  static async isReviewer(userId, request, locationId) {
    if (!userId || !request || !locationId) {
      return false;
    }
    
    try {
      // Fast path: if user is already in validCoordinators for the request, treat as reviewer
      if (Array.isArray(request.validCoordinators) && request.validCoordinators.length > 0) {
        const isInValidCoordinators = request.validCoordinators.some(coord => {
          const coordUserId = coord.userId?._id || coord.userId;
          return coordUserId?.toString() === userId.toString();
        });
        if (isInValidCoordinators) {
          return true;
        }
      }

      // Check permission for review
      const hasReviewPermission = await permissionService.checkPermission(
        userId,
        'request',
        'review',
        { locationId }
      );
      
      if (!hasReviewPermission) {
        return false;
      }
      
      // Authority check: reviewer must have authority >= requester
      const reviewerAuthority = await authorityService.calculateUserAuthority(userId);
      const requesterAuthority = request.requester?.authoritySnapshot || AUTHORITY_TIERS.BASIC_USER;
      
      // System admins (100) can bypass authority check
      if (reviewerAuthority >= AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return true;
      }
      
      return reviewerAuthority >= requesterAuthority;
    } catch (error) {
      console.error('[V2_STATE_MACHINE] Error checking reviewer permission:', error);
      return false;
    }
  }

  /**
   * Check if a transition is allowed based on permissions
   * @param {string} currentState - Current request state
   * @param {string} action - Action to perform
   * @param {string|ObjectId} userId - User performing the action
   * @param {Object} request - Request document
   * @param {Object} context - Context { locationId }
   * @returns {Promise<boolean>} True if transition is allowed
   */
  static async canTransition(currentState, action, userId, request, context = {}) {
    // 1. Check if transition is valid
    if (!this.isValidTransition(currentState, action)) {
      return false;
    }
    
    const locationId = context.locationId || request.municipalityId || request.district || request.province;
    
    // 2. Permission-based checks
    try {
      switch (action) {
        case REQUEST_ACTIONS.ACCEPT:
        case REQUEST_ACTIONS.REJECT:
          // Review actions require request.review permission
          return await this.isReviewer(userId, request, locationId);
        
        case REQUEST_ACTIONS.RESCHEDULE:
          // Reschedule typically requires request.reschedule permission
          let hasReschedulePermission = await permissionService.checkPermission(
            userId,
            'request',
            'reschedule',
            { locationId }
          );
          if (!hasReschedulePermission) {
            // Backward-compatibility: allow reschedule with review permission for valid reviewers
            const hasReviewPermission = await permissionService.checkPermission(
              userId,
              'request',
              'review',
              { locationId }
            );
            if (!hasReviewPermission) {
              return false;
            }
          }
          // Authority check: must have authority >= requester (or be requester)
          if (this.isRequester(userId, request)) {
            return true; // Requester can reschedule
          }
          const actorAuthority = await authorityService.calculateUserAuthority(userId);
          const requesterAuthority = request.requester?.authoritySnapshot || AUTHORITY_TIERS.BASIC_USER;
          return actorAuthority >= requesterAuthority || actorAuthority >= AUTHORITY_TIERS.SYSTEM_ADMIN;
        
        case REQUEST_ACTIONS.CONFIRM:
        case REQUEST_ACTIONS.DECLINE:
          // Only requester can confirm/decline
          if (!this.isRequester(userId, request)) {
            return false;
          }
          // Check permission
          return await permissionService.checkPermission(
            userId,
            'request',
            'confirm',
            { locationId }
          );
        
        case REQUEST_ACTIONS.CANCEL:
          // Requester or reviewer can cancel
          const hasCancelPermission = await permissionService.checkPermission(
            userId,
            'request',
            'cancel',
            { locationId }
          );
          if (!hasCancelPermission) {
            return false;
          }
          // Must be requester or reviewer
          return this.isRequester(userId, request) || await this.isReviewer(userId, request, locationId);
        
        default:
          return false;
      }
    } catch (error) {
      console.error('[V2_STATE_MACHINE] Error checking transition permission:', error);
      return false;
    }
  }

  /**
   * Determine the active responder in reschedule loop
   * Logic: Proposer ↔ Responder based on requester vs reviewer identity
   * @param {Object} request - Request document
   * @param {string|ObjectId} lastActorId - User who last performed an action
   * @returns {Promise<Object|null>} { userId, relationship, authority } or null
   */
  static async determineActiveResponder(request, lastActorId) {
    if (!request || !lastActorId) {
      return null;
    }
    
    const currentState = this.normalizeState(request.status || request.Status);
    
    // Final states have no active responder
    if (this.isFinalState(currentState)) {
      return null;
    }
    
    const requesterId = request.requester?.userId?.toString();
    const lastActorIdStr = lastActorId.toString();
    const isLastActorRequester = lastActorIdStr === requesterId;
    
    // For pending-review: reviewer is active responder
    if (currentState === REQUEST_STATES.PENDING_REVIEW) {
      // In broadcast model, any reviewer with jurisdiction can respond
      // Return a marker indicating "any reviewer" rather than specific user
      return {
        type: 'reviewer',
        relationship: 'reviewer',
        // No specific userId - any reviewer with jurisdiction can act
      };
    }
    
    // For review-rescheduled: determine based on who last acted
    if (currentState === REQUEST_STATES.REVIEW_RESCHEDULED) {
      if (isLastActorRequester) {
        // Requester rescheduled → next responder is any reviewer
        return {
          type: 'reviewer',
          relationship: 'reviewer',
          // No specific userId - any reviewer with jurisdiction can act
        };
      } else {
        // Reviewer (or any user with review permission) rescheduled → next responder is requester
        if (requesterId && request.requester?.userId) {
          const requesterUserId = request.requester.userId._id || request.requester.userId;
          return {
            userId: requesterUserId,
            relationship: 'requester',
            authority: request.requester.authoritySnapshot || null
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Check if state is final (no more transitions)
   * @param {string} state - State to check
   * @returns {boolean} True if final state
   */
  static isFinalState(state) {
    const normalizedState = this.normalizeState(state);
    return [
      REQUEST_STATES.REJECTED,
      REQUEST_STATES.CANCELLED,
      REQUEST_STATES.COMPLETED
    ].includes(normalizedState);
  }

  /**
   * Check if state allows editing
   * @param {string} state - State to check
   * @returns {boolean} True if editing is allowed
   */
  static canEdit(state) {
    const normalizedState = this.normalizeState(state);
    return normalizedState === REQUEST_STATES.PENDING_REVIEW;
  }

  /**
   * Check if state allows cancellation
   * @param {string} state - State to check
   * @returns {boolean} True if cancellation is allowed
   */
  static canCancel(state) {
    const normalizedState = this.normalizeState(state);
    return [
      REQUEST_STATES.PENDING_REVIEW,
      REQUEST_STATES.APPROVED
    ].includes(normalizedState);
  }
}

module.exports = V2RequestStateMachine;
